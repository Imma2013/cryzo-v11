import { openExpoStream } from "./expo-virtual-stream";
/** Decode HTTP/1 chunk framing without buffering a native JS bundle in memory. */
export class HttpChunkDecoder {
 private pending=Buffer.alloc(0);private remaining=-1;private ended=false;
 feed(value:Uint8Array){
  if(this.ended)return[];this.pending=Buffer.concat([this.pending,Buffer.from(value)]);const chunks:Buffer[]=[];
  while(this.pending.length){
   if(this.remaining<0){const line=this.pending.indexOf("\r\n");if(line<0){if(this.pending.length>4096)throw new Error("Invalid HTTP chunk header");break;}
    const raw=this.pending.subarray(0,line).toString().split(";",1)[0];if(!/^[a-f0-9]+$/i.test(raw))throw new Error("Invalid HTTP chunk");this.remaining=parseInt(raw,16);this.pending=this.pending.subarray(line+2);if(!this.remaining){this.ended=true;this.pending=Buffer.alloc(0);break;}
   }
   if(this.remaining>0){const size=Math.min(this.remaining,this.pending.length);chunks.push(this.pending.subarray(0,size));this.pending=this.pending.subarray(size);this.remaining-=size;if(this.remaining)break;}
   if(this.pending.length<2)break;if(this.pending[0]!==13||this.pending[1]!==10)throw new Error("Invalid HTTP chunk terminator");this.pending=this.pending.subarray(2);this.remaining=-1;
  }
  return chunks;
 }
 get complete(){return this.ended;}
}
export async function forwardExpoHttp(req:Request,sessionId:string,host:string,path:string){
 if(!["GET","HEAD"].includes(req.method))return new Response("Method not allowed",{status:405});
 const channel=await openExpoStream(sessionId,req.signal),reader=channel.readable.getReader();
 const allowed=["accept","expo-platform","expo-protocol-version","expo-runtime-version","expo-expect-signature","if-none-match"];
 const lines=[`${req.method} ${path} HTTP/1.1`,`Host: ${host}`,`Forwarded: host="${host}";proto=https`,`X-Forwarded-Host: ${host}`,"X-Forwarded-Proto: https","Accept-Encoding: identity","Connection: close"];
 for(const name of allowed){const value=req.headers.get(name);if(value && !/[\r\n]/.test(value))lines.push(`${name}: ${value}`);}
 try{await channel.send(Buffer.from(lines.join("\r\n")+"\r\n\r\n"));}catch(error){await channel.close();throw error;}
 let head=Buffer.alloc(0),boundary=-1;
 try{
  while((boundary=head.indexOf("\r\n\r\n"))<0){const next=await reader.read();if(next.done)throw new Error("Metro closed before replying");head=Buffer.concat([head,Buffer.from(next.value)]);if(head.length>131072 && head.indexOf("\r\n\r\n")<0)throw new Error("Metro response header too large");}
  const parts=head.subarray(0,boundary).toString("latin1").split("\r\n");const status=Number(parts.shift()?.split(" ")[1]);if(!Number.isInteger(status)||status<200||status>599)throw new Error("Invalid Metro response");
  const headers=new Headers();for(const line of parts){const split=line.indexOf(":");if(split>0)headers.append(line.slice(0,split),line.slice(split+1).trim());}
  const chunked=/chunked/i.test(headers.get("transfer-encoding") || "");for(const name of ["connection","transfer-encoding","keep-alive","set-cookie","content-encoding"])headers.delete(name);
  headers.set("Cache-Control","no-store");headers.set("X-Content-Type-Options","nosniff");headers.set("Referrer-Policy","no-referrer");headers.set("Cross-Origin-Resource-Policy","cross-origin");
  const rest=head.subarray(boundary+4);const decoder=chunked?new HttpChunkDecoder():null;
  if(req.method==="HEAD" || [204,304].includes(status)){await channel.close();return new Response(null,{status,headers});}
  const body=new ReadableStream<Uint8Array>({
   start(controller){if(rest.length){for(const chunk of decoder?decoder.feed(rest):[rest])controller.enqueue(chunk);}},
   async pull(controller){try{if(decoder?.complete){controller.close();await channel.close();return;}const next=await reader.read();if(next.done){if(decoder && !decoder.complete)throw new Error("Metro HTTP body was interrupted");controller.close();await channel.close();return;}for(const chunk of decoder?decoder.feed(next.value):[next.value])controller.enqueue(chunk);}catch(error){controller.error(error);await channel.close();}},
   cancel:()=>channel.close(),
  });
  if(chunked)headers.delete("content-length");return new Response(body,{status,headers});
 }catch(error){await channel.close();throw error;}
}
