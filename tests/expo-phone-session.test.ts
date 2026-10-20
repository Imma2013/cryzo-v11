import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import type { Sandbox } from "../src/lib/workspace/sandbox";
let session: typeof import("../src/lib/workspace/expo-phone-session");
let doc: EventTarget & {visibilityState:string}, win:EventTarget;
let phase="ready";
const config=()=>({sessionId:"a".repeat(32),producerUrl:"wss://cryzo.test/api/preview/expo/producer?ticket=test",publicOrigin:"https://session.preview.test",deviceUrl:"exps://session.preview.test",expiresAt:Date.now()+3_600_000});
beforeEach(async()=>{
 vi.useFakeTimers();vi.resetModules();phase="ready";
 doc=Object.assign(new EventTarget(),{visibilityState:"visible"});win=new EventTarget();
 vi.stubGlobal("document",doc);vi.stubGlobal("window",win);
 vi.stubGlobal("fetch",vi.fn(async(_url,init)=>{const body=JSON.parse(init.body);return Response.json(body.operation==="status"?{phase,deviceUrl:config().deviceUrl,message:"Reconnecting"}:config());}));
 session=await import("../src/lib/workspace/expo-phone-session");
});
afterEach(async()=>{await session.releasePhoneSession("conversation");vi.useRealTimers();vi.unstubAllGlobals();});
describe("one shared Expo phone session",()=>{
 it("deduplicates mounts, reduces ready polling, and removes a stale QR when the producer disconnects",async()=>{
  const runtime={setPhoneRelay:vi.fn(async()=>{})} as unknown as Sandbox;
  await Promise.all([session.preparePhoneSession("conversation",runtime,"auth",()=>{}),session.preparePhoneSession("conversation",runtime,"auth",()=>{})]);
  await vi.advanceTimersByTimeAsync(0);
  expect(session.phoneSnapshot("conversation").data?.deviceUrl).toBe(config().deviceUrl);
  expect(runtime.setPhoneRelay).toHaveBeenCalledTimes(1);
  const calls=vi.mocked(fetch).mock.calls.length;
  await vi.advanceTimersByTimeAsync(20_000);expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
  phase="connecting";await vi.advanceTimersByTimeAsync(12_000);
  expect(session.phoneSnapshot("conversation")).toMatchObject({phase:"connecting",data:null});
 });
 it("renews after background suspension and detaches resume listeners on release",async()=>{
  const runtime={setPhoneRelay:vi.fn(async()=>{})} as unknown as Sandbox;
  await session.preparePhoneSession("conversation",runtime,"auth",()=>{});await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(36_000);doc.dispatchEvent(new Event("visibilitychange"));await vi.advanceTimersByTimeAsync(0);
  expect(runtime.setPhoneRelay).toHaveBeenCalledTimes(2);
  await session.releasePhoneSession("conversation");const count=vi.mocked(fetch).mock.calls.length;
  win.dispatchEvent(new Event("online"));doc.dispatchEvent(new Event("visibilitychange"));await vi.advanceTimersByTimeAsync(0);
  expect(vi.mocked(fetch).mock.calls.length).toBe(count);
 });
});
