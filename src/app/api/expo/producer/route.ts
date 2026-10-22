import { upgradeWebSocket, type WebSocketData } from "@vercel/functions";
import { fetchMutation } from "convex/nextjs";
import { relayApi, relayArgs, relayClient, verifyProducerTicket, packet, credit, pushPackets } from "@/lib/server/expo-relay";
export const runtime="nodejs";
export const maxDuration=300;
export async function GET(req:Request){
 let claims:ReturnType<typeof verifyProducerTicket>,epoch:number;
 try{
  claims=verifyProducerTicket(new URL(req.url).searchParams.get("ticket") || "",req.headers.get("origin"));
  if(new URL(claims.origin).host!==new URL(req.url).host)throw new Error("Origin mismatch");
  epoch=await fetchMutation(relayApi.connect,{...relayArgs(claims.sessionId),expectedEpoch:claims.epoch});
 }catch{return new Response("Expo producer authorization failed",{status:401});}
 return upgradeWebSocket(ws=>{
  const client=relayClient(),args={...relayArgs(claims.sessionId),epoch};
  let closed=false,cursor=0,queuedBytes=0,flushing=false;
  let queue:{streamId:number;packet:Buffer}[]=[];
  let flushTimer:ReturnType<typeof setTimeout>|null=null;
  const heartbeat=setInterval(()=>{void fetchMutation(relayApi.heartbeat,args).catch(()=>ws.close(1012,"Reconnect Expo preview"));},15_000);
  const rotate=setTimeout(()=>ws.close(1012,"Renew Expo producer"),280_000);
  const send=(value:Buffer)=>{if(!closed && ws.readyState===1){if(ws.bufferedAmount>2_000_000){ws.close(1013,"Expo preview backpressure");return;}ws.send(value);}};
  let unsubscribe=()=>{};
  function cleanup(){if(closed)return;closed=true;clearInterval(heartbeat);clearTimeout(rotate);if(flushTimer)clearTimeout(flushTimer);unsubscribe();void client.close();void fetchMutation(relayApi.heartbeat,{...args,offline:true}).catch(()=>{});queue=[];}
  async function flush(){
   if(flushing || closed)return;flushing=true;
   try{while(queue.length && !closed){let bytes=0;const batch=[];while(queue.length && batch.length<8 && bytes+queue[0].packet.length<=256_000){const item=queue.shift()!;bytes+=item.packet.length;batch.push(item);}queuedBytes-=bytes;await pushPackets(claims.sessionId,epoch,"out",batch);}}
   catch{ws.close(1013,"Expo relay could not keep up");}
   finally{flushing=false;}
  }
  send(credit(0));
  unsubscribe=client.onUpdate(relayApi.pull,{...args,direction:"in"},result=>{
   if(closed)return;
   if(!result.online){ws.close(1012,"Expo session changed");return;}
   let through=cursor;
   for(const frame of result.frames){if(frame.sequence<=cursor)continue;send(Buffer.from(frame.packet));through=Math.max(through,frame.sequence);}
   if(through>cursor){cursor=through;void fetchMutation(relayApi.ack,{...args,direction:"in",through}).catch(()=>ws.close(1012,"Expo relay disconnected"));}
  },()=>ws.close(1012,"Expo relay unavailable"));
  ws.on("message",(value:WebSocketData)=>{
   if(closed)return;
   const buf=Array.isArray(value)?Buffer.concat(value):value instanceof ArrayBuffer?Buffer.from(value):Buffer.from(value);
   if(buf.length<5 || buf.length>65_541){ws.close(1009,"Invalid relay packet");return;}
   const type=buf[0],id=buf.readUInt32LE(1),body=buf.subarray(5);
   if(type===1){send(packet(4,id,Buffer.from([0x41])));return;} // No outbound TCP from this hosted relay.
   if(type===16){
    const port=body.length>=3?body.readUInt16LE(0):0;const allowed=port===8081 && body[2]===1;
    const reply=Buffer.alloc(5);reply.writeUInt16LE(port,0);reply[2]=allowed?1:0;reply.writeUInt16LE(allowed?8081:0,3);send(packet(18,0,reply));
    if(allowed)void fetchMutation(relayApi.heartbeat,{...args,listening:true}).catch(()=>ws.close(1012,"Expo relay unavailable"));return;
   }
   if(type===17){if(body.length>=2 && body.readUInt16LE(0)===8081)void fetchMutation(relayApi.heartbeat,{...args,listening:false}).catch(()=>{});return;}
   if(type===22 || type===3)return;
   if(![2,4,20].includes(type) || id<0x80000000)return;
   queuedBytes+=buf.length;if(queuedBytes>2_000_000){ws.close(1013,"Expo relay buffer full");return;}
   queue.push({streamId:id,packet:buf});
   if(!flushTimer)flushTimer=setTimeout(()=>{flushTimer=null;void flush();},25);
  });
  ws.on("close",cleanup);ws.on("error",cleanup);
 });
}
