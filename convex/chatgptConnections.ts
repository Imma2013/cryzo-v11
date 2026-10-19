import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
const encrypted = { ciphertext: v.string(), iv: v.string(), tag: v.string() };
function authorize(secret: string) {
  if (!process.env.CRYZO_INTERNAL_API_SECRET || secret !== process.env.CRYZO_INTERNAL_API_SECRET) throw new Error("Unauthorized");
}
export const begin = mutation({
  args: { internalSecret: v.string(), userId: v.id("users"), browserHash: v.string(), stateHash: v.string(), ...encrypted }, returns: v.null(),
  handler: async (ctx,args) => {
    authorize(args.internalSecret);
    const { internalSecret: _, ...data } = args;
    await ctx.db.insert("chatgptOAuthAttempts", {...data,expiresAt:Date.now()+600_000});
    await ctx.scheduler.runAfter(610_000,internal.chatgptConnections.sweep,{});
    return null;
  },
});
export const consume = mutation({
  args: { internalSecret: v.string(), browserHash: v.string(), stateHash: v.string() },
  handler: async (ctx,args) => {
    authorize(args.internalSecret);
    const row = await ctx.db.query("chatgptOAuthAttempts").withIndex("by_browser",q=>q.eq("browserHash",args.browserHash)).unique();
    if (!row) return null;
    await ctx.db.delete(row._id);
    if (row.expiresAt <= Date.now() || row.stateHash !== args.stateHash) return null;
    return { userId:row.userId,ciphertext:row.ciphertext,iv:row.iv,tag:row.tag };
  },
});
export const read = query({
  args: { internalSecret: v.string(), userId: v.id("users") },
  handler: async (ctx,args) => { authorize(args.internalSecret); return ctx.db.query("chatgptConnections").withIndex("by_user",q=>q.eq("userId",args.userId)).unique(); },
});
export const save = mutation({
  args: { internalSecret:v.string(),userId:v.id("users"),subject:v.string(),email:v.optional(v.string()),expiresAt:v.number(),expectedVersion:v.optional(v.number()),...encrypted }, returns:v.null(),
  handler: async(ctx,args)=>{
    authorize(args.internalSecret);
    const old=await ctx.db.query("chatgptConnections").withIndex("by_user",q=>q.eq("userId",args.userId)).unique();
    if (args.expectedVersion !== undefined && (!old || old.version !== args.expectedVersion || old.subject !== args.subject)) throw new Error("Connection changed; reconnect ChatGPT");
    const {internalSecret:_,expectedVersion:__,...data}=args;
    if(old) await ctx.db.replace(old._id,{...data,version:old.version+1,updatedAt:Date.now()});
    else await ctx.db.insert("chatgptConnections",{...data,version:1,updatedAt:Date.now()});
    return null;
  },
});
export const leaseRefresh = mutation({
  args:{internalSecret:v.string(),userId:v.id("users"),version:v.number()},returns:v.boolean(),
  handler:async(ctx,args)=>{
    authorize(args.internalSecret);
    const old=await ctx.db.query("chatgptConnections").withIndex("by_user",q=>q.eq("userId",args.userId)).unique();
    if(!old || old.version!==args.version || (old.refreshLease || 0)>Date.now()) return false;
    await ctx.db.patch(old._id,{refreshLease:Date.now()+30_000}); return true;
  },
});
export const disconnect = mutation({args:{},returns:v.null(),handler:async(ctx)=>{
  const userId=await getAuthUserId(ctx);if(!userId)throw new Error("Unauthorized");
  const row=await ctx.db.query("chatgptConnections").withIndex("by_user",q=>q.eq("userId",userId)).unique();
  if(row)await ctx.db.delete(row._id);return null;
}});
export const sweep = internalMutation({args:{},returns:v.null(),handler:async(ctx)=>{
  const expired=await ctx.db.query("chatgptOAuthAttempts").withIndex("by_expiry",q=>q.lt("expiresAt",Date.now())).take(100);
  for(const row of expired)await ctx.db.delete(row._id);
  if(expired.length===100)await ctx.scheduler.runAfter(0,internal.chatgptConnections.sweep,{});
  return null;
}});
