import {beforeEach,afterEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({mutation:vi.fn(),push:vi.fn(),close:vi.fn(),unsubscribe:vi.fn(),subscribe:vi.fn()}));
vi.mock("convex/nextjs",()=>({fetchMutation:mocks.mutation}));
vi.mock("../src/lib/server/expo-relay",()=>({
 relayApi:{openStream:"open",ack:"ack",endStream:"end",pull:"pull"},relayArgs:(sessionId:string)=>({sessionId}),
 relayStatus:async()=>({online:true,listening:true,epoch:1}),
 relayClient:()=>({close:mocks.close,onUpdate:mocks.subscribe}),pushPackets:mocks.push,
 packet:()=>Buffer.alloc(5),credit:()=>Buffer.alloc(9),
}));
import {openExpoStream} from "../src/lib/server/expo-virtual-stream";
let active:Awaited<ReturnType<typeof openExpoStream>>|undefined;
let deliver:(value:unknown)=>void;
beforeEach(()=>{
 vi.clearAllMocks();active=undefined;mocks.mutation.mockResolvedValue(null);mocks.push.mockResolvedValue(null);mocks.close.mockResolvedValue(null);
 mocks.subscribe.mockImplementation((_ref,_args,callback)=>{deliver=callback;return mocks.unsubscribe;});
});
afterEach(async()=>{await active?.close();});
describe("Expo relay failure cleanup",()=>{
 it("releases the stream and subscription when acknowledging a frame fails",async()=>{
  active=await openExpoStream("session");
  mocks.mutation.mockImplementation(async ref=>{if(ref==="ack")throw new Error("network interrupted");return null;});
  const data=new Uint8Array([2,0,0,0,0,104,105]);
  deliver({online:true,frames:[{sequence:1,streamId:0x80000001,packet:data.buffer}]});
  await expect(active.readable.getReader().read()).rejects.toThrow("network interrupted");
  await vi.waitFor(()=>expect(mocks.mutation).toHaveBeenCalledWith("end",expect.objectContaining({sessionId:"session"})));
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();expect(mocks.close).toHaveBeenCalledOnce();
 });
 it("releases quota immediately when the initial connection packet cannot be delivered",async()=>{
  mocks.push.mockRejectedValueOnce(new Error("producer unavailable"));
  await expect(openExpoStream("session")).rejects.toThrow("producer unavailable");
  expect(mocks.mutation).toHaveBeenCalledWith("end",expect.objectContaining({sessionId:"session"}));
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();expect(mocks.close).toHaveBeenCalledOnce();
 });
});
