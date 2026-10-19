import { describe, expect, it } from "vitest";
import { chatgptRequestBody } from "../src/lib/ai/chatgpt-request";
import { completedChatGPTResponse } from "../src/lib/ai/chatgpt-response";
describe("ChatGPT plan transport",()=>{
 it("forces streaming and stateless inference and removes incompatible API fields",()=>{
  expect(chatgptRequestBody({model:"account-model",input:[],store:true,stream:false,temperature:1,metadata:{id:1},max_output_tokens:4,previous_response_id:"x",tools:[{type:"function",name:"writeFile"}]})).toEqual({model:"account-model",input:[],tools:[{type:"function",name:"writeFile"}],store:false,stream:true});
  expect(()=>chatgptRequestBody({input:"hello"})).toThrow();expect(()=>chatgptRequestBody({input:[],tools:[{type:"mcp"}]})).toThrow();
 });
 it("requires a completed event even when some output was streamed",async()=>{
  const interrupted=new Response('data: {"type":"response.output_text.delta","delta":"hello"}\n\n');
  await expect(completedChatGPTResponse(interrupted)).rejects.toThrow("response.completed");
  const completed=await completedChatGPTResponse(new Response('data: {"type":"response.completed","response":{"id":"r","output":[]}}\n\n'));
  expect(await completed.json()).toEqual({id:"r",output:[]});
  const limited=await completedChatGPTResponse(new Response('data: {"type":"response.failed","response":{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}}\n\n'));
  expect(limited.status).toBe(429);
 });
});
