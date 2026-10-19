import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ConvexClient } from "convex/browser";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
export const relayApi=(api as any).expoRelay;
export function relaySecret(){const value=process.env.CRYZO_INTERNAL_API_SECRET;if(!value)throw new Error("Expo phone forwarding is not configured");return value;}
export function previewDomain(){const value=process.env.CRYZO_EXPO_PREVIEW_DOMAIN?.trim();if(!value || !/^[a-z0-9.-]+$/.test(value) || value.startsWith("."))throw new Error("The Expo preview domain is not configured");return value;}
export function previewHost(sessionId:string){if(!/^[a-f0-9]{32}$/.test(sessionId))throw new Error("Invalid Expo session");return sessionId+"."+previewDomain();}
export function relayClient(){const url=process.env.NEXT_PUBLIC_CONVEX_URL;if(!url)throw new Error("Convex is not configured");return new ConvexClient(url);}
export function packet(type:number,id:number,payload:Uint8Array=Buffer.alloc(0)){const result=Buffer.alloc(5+payload.length);result[0]=type;result.writeUInt32LE(id>>>0,1);result.set(payload,5);return result;}
export function credit(id:number){const p=Buffer.alloc(4);p.writeUInt32LE(32);return packet(3,id,p);}
export const relayArgs=(sessionId:string)=>({sessionId,internalSecret:relaySecret()});
export async function relayStatus(sessionId:string){return fetchQuery(relayApi.status,relayArgs(sessionId));}
export async function createRelaySession(userId:string,conversationId:string,origin:string){
 previewDomain();
 const sessionId=randomBytes(16).toString("hex");
 await fetchMutation(relayApi.create,{...relayArgs(sessionId),userId:userId as Id<"users">,conversationId:conversationId as Id<"conversations">});
 return relayConfiguration(sessionId,userId,origin);
}
type Ticket={sessionId:string;userId:string;epoch:number;origin:string;expiresAt:number};
export async function relayConfiguration(sessionId:string,userId:string,origin:string){
 const status=await relayStatus(sessionId);if(status.userId!==userId)throw new Error("Unauthorized Expo session");
 const claims:Ticket={sessionId,userId,epoch:status.epoch,origin,expiresAt:Math.min(status.expiresAt,Date.now()+300_000)};
 const payload=Buffer.from(JSON.stringify(claims)).toString("base64url");const signature=createHmac("sha256",relaySecret()).update("cryzo-expo-producer-v1:"+payload).digest("base64url");
 const producer=new URL("/api/preview/expo/producer",origin);producer.protocol="wss:";producer.searchParams.set("ticket",payload+"."+signature);
 const publicOrigin="https://"+previewHost(sessionId);
 return{sessionId,producerUrl:producer.toString(),publicOrigin,deviceUrl:"exps://"+previewHost(sessionId),expiresAt:status.expiresAt};
}
export function verifyProducerTicket(value:string,origin:string|null):Ticket{
 const [payload,signature,...extra]=value.split(".");if(!payload||!signature||extra.length)throw new Error("Invalid ticket");
 const expected=createHmac("sha256",relaySecret()).update("cryzo-expo-producer-v1:"+payload).digest();const received=Buffer.from(signature,"base64url");
 if(received.length!==expected.length || !timingSafeEqual(received,expected))throw new Error("Invalid ticket");
 const claims=JSON.parse(Buffer.from(payload,"base64url").toString("utf8")) as Ticket;
 if(!/^[a-f0-9]{32}$/.test(claims.sessionId)||claims.origin!==origin||claims.expiresAt<=Date.now()||!Number.isInteger(claims.epoch))throw new Error("Expired ticket");return claims;
}
export async function pushPackets(sessionId:string,epoch:number,direction:"in"|"out",packets:{streamId:number;packet:Buffer}[]){
 for(let offset=0;offset<packets.length;){let size=0;const batch=[];while(offset<packets.length && batch.length<8 && size+packets[offset].packet.length<=256_000){const item=packets[offset++];size+=item.packet.length;batch.push({streamId:item.streamId,packet:Uint8Array.from(item.packet).buffer});}if(!batch.length)throw new Error("Relay packet too large");await fetchMutation(relayApi.push,{...relayArgs(sessionId),epoch,direction,packets:batch});}
}
