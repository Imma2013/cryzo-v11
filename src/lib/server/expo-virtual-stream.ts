import { randomBytes } from "node:crypto";
import { Duplex } from "node:stream";
import { fetchMutation } from "convex/nextjs";
import { relayApi,relayArgs,relayClient,relayStatus,packet,credit,pushPackets } from "./expo-relay";
type Frame={sequence:number;streamId:number;packet:ArrayBuffer};
export async function openExpoStream(sessionId:string,signal?:AbortSignal){
 const status=await relayStatus(sessionId);if(!status.online || !status.listening)throw new Error("Keep Cryzo open while previewing on your phone");
 const epoch=status.epoch,streamId=(randomBytes(4).readUInt32LE(0)|0x80000000)>>>0,args={...relayArgs(sessionId),epoch,streamId};
 await fetchMutation(relayApi.openStream,args);
 const client=relayClient();let closed=false,cursor=0,dataCount=0,queuedBytes=0;
 const frames:Frame[]=[];let wake:(()=>void)|undefined;let failure:Error|undefined;
 let unsubscribe=()=>{};
 const timer=setTimeout(()=>{failure=new Error("Expo stream expired. Reconnect your phone");wake?.();},285_000);
 const abort=()=>{failure=new Error("Expo request cancelled");wake?.();void close();};
 async function close(){if(closed)return;closed=true;clearTimeout(timer);signal?.removeEventListener("abort",abort);unsubscribe();wake?.();await client.close();await fetchMutation(relayApi.endStream,args).catch(()=>{});}
 const readable=new ReadableStream<Uint8Array>({
  async pull(controller){
   while(!closed){
    if(failure){controller.error(failure);await close();return;}
    const frame=frames.shift();if(!frame){await new Promise<void>(resolve=>{wake=resolve;});wake=undefined;continue;}
    const value=Buffer.from(frame.packet);queuedBytes-=value.length;
    await fetchMutation(relayApi.ack,{...args,direction:"out",through:frame.sequence});
    if(value[0]===2){if(++dataCount%16===0)await pushPackets(sessionId,epoch,"in",[{streamId,packet:credit(streamId)}]);controller.enqueue(value.subarray(5));return;}
    if(value[0]===4 || value[0]===20){controller.close();await close();return;}
   }
   controller.close();
  },cancel:()=>close(),
 },{highWaterMark:1});
 unsubscribe=client.onUpdate(relayApi.pull,{...args,direction:"out"},result=>{
  if(closed)return;
  if(!result.online){failure=new Error("Expo producer disconnected. Reconnect phone preview");wake?.();return;}
  for(const frame of result.frames){if(frame.sequence<=cursor)continue;cursor=frame.sequence;queuedBytes+=frame.packet.byteLength;frames.push(frame);}
  if(queuedBytes>2_000_000)failure=new Error("Expo consumer is too slow");wake?.();
 },()=>{failure=new Error("Expo relay disconnected");wake?.();});
 signal?.addEventListener("abort",abort,{once:true});if(signal?.aborted)abort();
 const target=Buffer.alloc(9);target.writeUInt16LE(8081,0);target.write("phone:0",2);
 await pushPackets(sessionId,epoch,"in",[{streamId,packet:packet(19,streamId,target)},{streamId,packet:credit(streamId)}]);
 return{
  readable,close,
  async send(value:Uint8Array){if(closed)throw new Error("Expo connection closed");const packets=[];for(let i=0;i<value.length;i+=65536)packets.push({streamId,packet:packet(2,streamId,value.subarray(i,i+65536))});await pushPackets(sessionId,epoch,"in",packets);},
  async shutdown(){if(!closed)await pushPackets(sessionId,epoch,"in",[{streamId,packet:packet(20,streamId)}]);},
 };
}
export type ExpoStream=Awaited<ReturnType<typeof openExpoStream>>;
export function expoDuplex(channel:ExpoStream){
 const reader=channel.readable.getReader();let reading=false;
 const socket=new Duplex({
  read(){if(reading)return;reading=true;void(async()=>{try{while(true){const next=await reader.read();if(next.done){socket.push(null);break;}if(!socket.push(Buffer.from(next.value)))break;}}catch(error){socket.destroy(error as Error);}finally{reading=false;}})();},
  write(chunk,_encoding,callback){void channel.send(chunk).then(()=>callback(),error=>callback(error));},
  final(callback){void channel.shutdown().then(()=>callback(),error=>callback(error));},
  destroy(error,callback){void channel.close().finally(()=>callback(error));},
 });
 queueMicrotask(()=>socket.emit("connect"));return socket;
}
