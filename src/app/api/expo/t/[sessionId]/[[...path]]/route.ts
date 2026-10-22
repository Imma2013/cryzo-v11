import WebSocket from "ws";
import { upgradeWebSocket, type WebSocketData } from "@vercel/functions";
import { previewHost } from "@/lib/server/expo-relay";
import { openExpoStream, expoDuplex } from "@/lib/server/expo-virtual-stream";
import { forwardExpoHttp } from "@/lib/server/expo-http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;
type Context={params:Promise<{sessionId:string;path?:string[]}>};
export async function GET(req:Request,ctx:Context){
 const {sessionId,path=[]}=await ctx.params;let host:string;
 try{host=previewHost(sessionId);if(new URL(req.url).hostname!==host)return new Response("Unknown preview",{status:404});}catch{return new Response("Unknown preview",{status:404});}
 const original="/"+path.map(encodeURIComponent).join("/")+new URL(req.url).search;
 try{
  if(req.headers.get("upgrade")?.toLowerCase()==="websocket"){
   if(path[0]!=="hot" && path[0]!=="message")return new Response("WebSocket path not allowed",{status:403});
   const channel=await openExpoStream(sessionId),socket=expoDuplex(channel);
   const metro=new WebSocket("ws://localhost:8081"+original,{createConnection:()=>socket as any,headers:{Host:host,"X-Forwarded-Host":host,"X-Forwarded-Proto":"https"},maxPayload:1_000_000,handshakeTimeout:15_000});
   try{await new Promise<void>((resolve,reject)=>{metro.once("open",resolve);metro.once("error",reject);});}catch(error){metro.terminate();await channel.close();throw error;}
   return upgradeWebSocket(phone=>{
    let closed=false;const timer=setTimeout(()=>phone.close(1012,"Reconnect Expo"),275_000);
    const close=()=>{if(closed)return;closed=true;clearTimeout(timer);metro.close();void channel.close();if(phone.readyState===1)phone.close(1012,"Expo preview reconnecting");};
    phone.on("message",(value:WebSocketData,isBinary:boolean)=>{if(metro.readyState!==WebSocket.OPEN)return;if(metro.bufferedAmount>1_000_000){close();return;}metro.send(value,{binary:isBinary});});
    metro.on("message",(value,isBinary)=>{if(phone.readyState===1){if(phone.bufferedAmount>1_000_000){close();return;}phone.send(value,{binary:isBinary});}});
    phone.on("close",close);phone.on("error",close);metro.on("close",close);metro.on("error",close);
   });
  }
  const response=await forwardExpoHttp(req,sessionId,host,original);response.headers.set("Access-Control-Allow-Origin","*");return response;
 }catch{return new Response("Expo preview is reconnecting. Keep Cryzo open and retry.",{status:503,headers:{"Cache-Control":"no-store","Retry-After":"2"}});}
}
export const HEAD=GET;
export async function OPTIONS(){return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, HEAD, OPTIONS","Access-Control-Allow-Headers":"expo-platform, expo-protocol-version, expo-runtime-version, expo-expect-signature, accept","Cache-Control":"no-store"}});}
