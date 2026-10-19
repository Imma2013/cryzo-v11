/// <reference types="vite/client" />
import { beforeEach,afterEach,describe,expect,it,vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
const modules=import.meta.glob("../convex/**/*.ts"),key="test-expo-relay-secret";
beforeEach(()=>{vi.stubEnv("CRYZO_INTERNAL_API_SECRET",key);vi.useFakeTimers();});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
async function fixture(){const t=convexTest(schema,modules);const ids=await t.run(async ctx=>{const userId=await ctx.db.insert("users",{email:"owner@example.com"}),other=await ctx.db.insert("users",{email:"other@example.com"});const conversationId=await ctx.db.insert("conversations",{userId,title:"Expo",composioSessionId:null,createdAt:Date.now(),updatedAt:Date.now()});return{userId,other,conversationId};});return{t,...ids};}
describe("temporary Expo relay",()=>{
 it("checks ownership and fences reused producer tickets",async()=>{
  const {t,userId,other,conversationId}=await fixture(),sessionId="a".repeat(32),base={internalSecret:key,sessionId};
  await expect(t.mutation(api.expoRelay.create,{...base,userId:other,conversationId})).rejects.toThrow("Unauthorized");
  await t.mutation(api.expoRelay.create,{...base,userId,conversationId});
  expect(await t.mutation(api.expoRelay.connect,{...base,expectedEpoch:0})).toBe(1);
  await expect(t.mutation(api.expoRelay.connect,{...base,expectedEpoch:0})).rejects.toThrow("already used");
  await t.mutation(api.expoRelay.heartbeat,{...base,epoch:1,listening:true});
  await expect(t.query(api.expoRelay.status,{...base,internalSecret:"wrong"})).rejects.toThrow("Unauthorized");
  await t.mutation(api.expoRelay.connect,{...base,expectedEpoch:1});
  await t.mutation(api.expoRelay.heartbeat,{...base,epoch:1,offline:true});
  expect((await t.query(api.expoRelay.status,base)).online).toBe(true);
 });
 it("bounds packets and immediately frees cancelled stream quota and buffered bytes",async()=>{
  const {t,userId,conversationId}=await fixture(),sessionId="b".repeat(32),base={internalSecret:key,sessionId};
  await t.mutation(api.expoRelay.create,{...base,userId,conversationId});await t.mutation(api.expoRelay.connect,{...base,expectedEpoch:0});await t.mutation(api.expoRelay.heartbeat,{...base,epoch:1,listening:true});
  const args={...base,epoch:1,streamId:0x80000001};await t.mutation(api.expoRelay.openStream,args);
  const packet=new Uint8Array(100);packet[0]=2;new DataView(packet.buffer).setUint32(1,args.streamId,true);
  await t.mutation(api.expoRelay.push,{...base,epoch:1,direction:"out",packets:[{streamId:args.streamId,packet:packet.buffer}]});
  expect((await t.query(api.expoRelay.pull,{...args,direction:"out"})).frames).toHaveLength(1);
  await expect(t.mutation(api.expoRelay.push,{...base,epoch:1,direction:"out",packets:[{streamId:args.streamId,packet:new ArrayBuffer(70000)}]})).rejects.toThrow("size");
  await t.mutation(api.expoRelay.endStream,args);
  const row=await t.run(ctx=>ctx.db.query("expoRelaySessions").withIndex("by_session",q=>q.eq("sessionId",sessionId)).unique());expect(row?.pendingBytes).toBe(6);
  await t.mutation(api.expoRelay.openStream,{...args,streamId:0x80000002});
  await t.mutation(api.expoRelay.close,{...base,userId});await expect(t.query(api.expoRelay.status,base)).rejects.toThrow("expired");
 });
});
describe("ChatGPT OAuth transaction storage",()=>{
 it("consumes a transaction once and prevents refresh or disconnect races from restoring a deleted connection",async()=>{
  const {t,userId}=await fixture();const encrypted={ciphertext:"opaque",iv:"iv",tag:"tag"};
  await t.mutation(api.chatgptConnections.begin,{internalSecret:key,userId,browserHash:"browser",stateHash:"state",...encrypted});
  const args={internalSecret:key,browserHash:"browser",stateHash:"state"};expect(await t.mutation(api.chatgptConnections.consume,args)).toMatchObject({userId});expect(await t.mutation(api.chatgptConnections.consume,args)).toBeNull();
  await t.mutation(api.chatgptConnections.save,{internalSecret:key,userId,subject:"openai-subject",expiresAt:Date.now()+3600,...encrypted});
  expect(await t.mutation(api.chatgptConnections.leaseRefresh,{internalSecret:key,userId,version:1})).toBe(true);expect(await t.mutation(api.chatgptConnections.leaseRefresh,{internalSecret:key,userId,version:1})).toBe(false);
  await t.withIdentity({subject:userId+"|session"}).mutation(api.chatgptConnections.disconnect,{});
  await expect(t.mutation(api.chatgptConnections.save,{internalSecret:key,userId,subject:"openai-subject",expiresAt:Date.now()+3600,expectedVersion:1,...encrypted})).rejects.toThrow("Connection changed");
 });
});
