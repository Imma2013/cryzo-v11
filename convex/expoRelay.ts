import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
const direction=v.union(v.literal("in"),v.literal("out"));
const base={internalSecret:v.string(),sessionId:v.string()};
function auth(secret:string){if(!process.env.CRYZO_INTERNAL_API_SECRET || secret!==process.env.CRYZO_INTERNAL_API_SECRET)throw new Error("Unauthorized");}
async function session(ctx:QueryCtx|MutationCtx,id:string){
 const row=await ctx.db.query("expoRelaySessions").withIndex("by_session",q=>q.eq("sessionId",id)).unique();
 if(!row || row.expiresAt<=Date.now())throw new Error("Expo session expired");return row;
}
export const create=mutation({args:{...base,userId:v.id("users"),conversationId:v.id("conversations")},returns:v.null(),handler:async(ctx,args)=>{
 auth(args.internalSecret);if(!/^[a-f0-9]{32}$/.test(args.sessionId))throw new Error("Invalid Expo session");
 const conversation=await ctx.db.get(args.conversationId);if(!conversation || conversation.userId!==args.userId)throw new Error("Unauthorized");
 const active=await ctx.db.query("expoRelaySessions").withIndex("by_user_expiry",q=>q.eq("userId",args.userId).gt("expiresAt",Date.now())).take(4);
 if(active.length>=4)throw new Error("Close another phone preview before opening a new one");
 await ctx.db.insert("expoRelaySessions",{sessionId:args.sessionId,userId:args.userId,conversationId:args.conversationId,epoch:0,online:false,listening:false,heartbeatAt:0,nextSeq:0,pendingBytes:0,expiresAt:Date.now()+3_600_000});
 await ctx.scheduler.runAfter(305_000,internal.expoRelay.sweep,{});return null;
}});
export const status=query({args:base,handler:async(ctx,args)=>{auth(args.internalSecret);const row=await session(ctx,args.sessionId);return{userId:row.userId,conversationId:row.conversationId,epoch:row.epoch,expiresAt:row.expiresAt,online:row.online && row.heartbeatAt>Date.now()-45_000,listening:row.listening};}});
export const connect=mutation({args:{...base,expectedEpoch:v.number()},returns:v.number(),handler:async(ctx,args)=>{
 auth(args.internalSecret);const row=await session(ctx,args.sessionId);if(row.epoch!==args.expectedEpoch)throw new Error("Producer ticket already used");
 await ctx.db.patch(row._id,{epoch:row.epoch+1,online:true,listening:false,heartbeatAt:Date.now(),pendingBytes:0,nextSeq:0});return row.epoch+1;
}});
export const heartbeat=mutation({args:{...base,epoch:v.number(),listening:v.optional(v.boolean()),offline:v.optional(v.boolean())},returns:v.null(),handler:async(ctx,args)=>{
 auth(args.internalSecret);const row=await session(ctx,args.sessionId);if(row.epoch!==args.epoch)return null;
 await ctx.db.patch(row._id,{heartbeatAt:Date.now(),online:!args.offline,...(args.listening!==undefined?{listening:args.listening}:{})});return null;
}});
export const openStream=mutation({args:{...base,epoch:v.number(),streamId:v.number()},returns:v.null(),handler:async(ctx,args)=>{
 auth(args.internalSecret);const row=await session(ctx,args.sessionId);
 if(row.epoch!==args.epoch || !row.online || !row.listening || row.heartbeatAt<Date.now()-45_000)throw new Error("Keep Cryzo open while using phone preview");
 if(!Number.isInteger(args.streamId) || args.streamId<0x80000000 || args.streamId>0xffffffff)throw new Error("Invalid stream");
 const active=await ctx.db.query("expoRelayStreams").withIndex("by_session_expiry",q=>q.eq("sessionId",args.sessionId).eq("epoch",args.epoch).gt("expiresAt",Date.now())).take(8);
 if(active.length>=8)throw new Error("Expo preview is busy. Retry shortly");
 const duplicate=await ctx.db.query("expoRelayStreams").withIndex("by_stream",q=>q.eq("sessionId",args.sessionId).eq("epoch",args.epoch).eq("streamId",args.streamId)).unique();if(duplicate)throw new Error("Duplicate stream");
 await ctx.db.insert("expoRelayStreams",{sessionId:args.sessionId,epoch:args.epoch,streamId:args.streamId,expiresAt:Date.now()+290_000});return null;
}});
export const push=mutation({args:{...base,epoch:v.number(),direction,packets:v.array(v.object({streamId:v.number(),packet:v.bytes()}))},returns:v.null(),handler:async(ctx,args)=>{
 auth(args.internalSecret);const row=await session(ctx,args.sessionId);if(row.epoch!==args.epoch || !row.online)throw new Error("Expo producer changed");
 const size=args.packets.reduce((sum,p)=>sum+p.packet.byteLength,0);
 if(!args.packets.length || args.packets.length>8 || size>256_000 || row.pendingBytes+size>4_000_000)throw new Error("Expo relay backpressure limit");
 let sequence=row.nextSeq, insertedBytes=0;
 for(const item of args.packets){
  if(item.packet.byteLength<5 || item.packet.byteLength>65_541)throw new Error("Invalid relay packet size");
  const stream=await ctx.db.query("expoRelayStreams").withIndex("by_stream",q=>q.eq("sessionId",args.sessionId).eq("epoch",args.epoch).eq("streamId",item.streamId)).unique();
  if(!stream || stream.expiresAt<=Date.now()){if(args.direction === "out")continue;throw new Error("Expo stream expired");}
  insertedBytes += item.packet.byteLength;
  await ctx.db.insert("expoRelayFrames",{sessionId:args.sessionId,epoch:args.epoch,streamId:item.streamId,direction:args.direction,sequence:++sequence,packet:item.packet,size:item.packet.byteLength,expiresAt:Math.min(stream.expiresAt,Date.now()+290_000)});
 }
 await ctx.db.patch(row._id,{nextSeq:sequence,pendingBytes:row.pendingBytes+insertedBytes});return null;
}});
export const pull=query({args:{...base,epoch:v.number(),direction,streamId:v.optional(v.number())},handler:async(ctx,args)=>{
 auth(args.internalSecret);const row=await session(ctx,args.sessionId);if(row.epoch!==args.epoch || !row.online)return{online:false,frames:[]};
 const frames=args.streamId===undefined
  ? await ctx.db.query("expoRelayFrames").withIndex("by_session_direction",q=>q.eq("sessionId",args.sessionId).eq("epoch",args.epoch).eq("direction",args.direction)).order("asc").take(4)
  : await ctx.db.query("expoRelayFrames").withIndex("by_stream_direction",q=>q.eq("sessionId",args.sessionId).eq("epoch",args.epoch).eq("streamId",args.streamId!).eq("direction",args.direction)).order("asc").take(4);
 return{online:row.heartbeatAt>Date.now()-45_000,frames:frames.map(frame=>({sequence:frame.sequence,streamId:frame.streamId,packet:frame.packet}))};
}});
export const ack=mutation({args:{...base,epoch:v.number(),direction,through:v.number(),streamId:v.optional(v.number())},returns:v.null(),handler:async(ctx,args)=>{
 auth(args.internalSecret);const row=await session(ctx,args.sessionId);if(row.epoch!==args.epoch)return null;
 const frames=args.streamId===undefined
  ? await ctx.db.query("expoRelayFrames").withIndex("by_session_direction",q=>q.eq("sessionId",args.sessionId).eq("epoch",args.epoch).eq("direction",args.direction).lte("sequence",args.through)).take(16)
  : await ctx.db.query("expoRelayFrames").withIndex("by_stream_direction",q=>q.eq("sessionId",args.sessionId).eq("epoch",args.epoch).eq("streamId",args.streamId!).eq("direction",args.direction).lte("sequence",args.through)).take(16);
 for(const frame of frames)await ctx.db.delete(frame._id);
 await ctx.db.patch(row._id,{pendingBytes:Math.max(0,row.pendingBytes-frames.reduce((sum,frame)=>sum+frame.size,0))});return null;
}});
export const close=mutation({args:{...base,userId:v.id("users")},returns:v.null(),handler:async(ctx,args)=>{
 auth(args.internalSecret);const row=await session(ctx,args.sessionId);if(row.userId!==args.userId)throw new Error("Unauthorized");
 await ctx.db.patch(row._id,{online:false,listening:false,expiresAt:Date.now()});await ctx.scheduler.runAfter(0,internal.expoRelay.sweep,{});return null;
}});
export const sweep=internalMutation({args:{},returns:v.null(),handler:async(ctx)=>{
 let more=false;
 for(const name of ["expoRelayFrames","expoRelayStreams","expoRelaySessions"] as const){
  const rows=await ctx.db.query(name).withIndex("by_expiry",q=>q.lt("expiresAt",Date.now())).take(16);
  for(const row of rows)await ctx.db.delete(row._id);if(rows.length===16)more=true;
 }
 if(more)await ctx.scheduler.runAfter(0,internal.expoRelay.sweep,{});
 else {const next=await ctx.db.query("expoRelaySessions").withIndex("by_expiry").order("asc").first();if(next)await ctx.scheduler.runAfter(60_000,internal.expoRelay.sweep,{});}
 return null;
}});

export const endStream=mutation({args:{...base,epoch:v.number(),streamId:v.number()},returns:v.null(),handler:async(ctx,args)=>{
 auth(args.internalSecret);const row=await session(ctx,args.sessionId);if(row.epoch!==args.epoch)return null;
 const stream=await ctx.db.query("expoRelayStreams").withIndex("by_stream",q=>q.eq("sessionId",args.sessionId).eq("epoch",args.epoch).eq("streamId",args.streamId)).unique();
 if(!stream || stream.expiresAt<=Date.now())return null;
 const packet=new Uint8Array(6);packet[0]=4;new DataView(packet.buffer).setUint32(1,args.streamId,true);packet[5]=2;
 await ctx.db.insert("expoRelayFrames",{sessionId:args.sessionId,epoch:args.epoch,streamId:args.streamId,direction:"in",sequence:row.nextSeq+1,packet:packet.buffer,size:6,expiresAt:Date.now()+15_000});
 await ctx.db.patch(row._id,{nextSeq:row.nextSeq+1,pendingBytes:row.pendingBytes+6});await ctx.db.patch(stream._id,{expiresAt:Date.now()});return null;
}});
