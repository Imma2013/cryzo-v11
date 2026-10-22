import { NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { requireRequestUserId } from "@/lib/server/request-user";
import { createRelaySession,relayConfiguration,relayStatus,relayApi,relayArgs,previewHost } from "@/lib/server/expo-relay";
import type { Id } from "../../../../../../convex/_generated/dataModel";
export const runtime="nodejs";
export const maxDuration=30;
export async function POST(req:Request){
 const userId=await requireRequestUserId(req);if(!userId)return NextResponse.json({error:"Sign in to Cryzo"},{status:401});
 try{
  const input=await req.json() as {operation?:string;conversationId?:string;sessionId?:string};
  if(input.operation==="start" || !input.operation){if(!input.conversationId)throw new Error("Conversation is required");return NextResponse.json(await createRelaySession(userId,input.conversationId,new URL(req.url).origin),{headers:{"Cache-Control":"no-store"}});}
  if(!input.sessionId)throw new Error("Session is required");const status=await relayStatus(input.sessionId);if(status.userId!==userId)return NextResponse.json({error:"Unknown preview"},{status:404});
  if(input.operation==="renew")return NextResponse.json(await relayConfiguration(input.sessionId,userId,new URL(req.url).origin));
  if(input.operation==="close"){await fetchMutation(relayApi.close,{...relayArgs(input.sessionId),userId:userId as Id<"users">});return NextResponse.json({closed:true});}
  if(input.operation!=="status")throw new Error("Unknown preview operation");
  if(!status.online || !status.listening)return NextResponse.json({phase:"connecting",message:"Connecting this Vivari session to your phone…"});
  const publicOrigin="https://"+previewHost(input.sessionId);
  let response:Response;
  try{response=await fetch(publicOrigin+"/",{headers:{Accept:"application/expo+json","Expo-Platform":"ios","Expo-Protocol-Version":"1"},cache:"no-store",signal:AbortSignal.timeout(15_000)});}catch{return NextResponse.json({phase:"connecting",message:"The public Expo preview address is not reachable yet. Check preview DNS and reconnect."});}
  if(!response.ok)return NextResponse.json({phase:"connecting",message:"Metro is starting. Waiting for the public manifest…"});
  let manifest:any;try{manifest=await response.json();}catch{return NextResponse.json({phase:"connecting",message:"Metro has not returned an Expo manifest yet."});}
  const bundle=manifest?.launchAsset?.url || manifest?.bundleUrl;
  if(typeof bundle!=="string" || !bundle.startsWith(publicOrigin+"/"))return NextResponse.json({phase:"error",message:"Metro advertised a bundle outside this phone session. Reconnect Expo preview."});
  return NextResponse.json({phase:"ready",deviceUrl:"exps://"+previewHost(input.sessionId),bundleUrl:bundle,expiresAt:status.expiresAt},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Expo phone forwarding could not connect. Check preview configuration and retry."},{status:503});}
}
