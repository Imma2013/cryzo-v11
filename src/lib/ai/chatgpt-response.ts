/** Keep plan inference streaming on the wire, including callers using generateText. */
export async function completedChatGPTResponse(response: Response): Promise<Response> {
  if (!response.ok || !response.body) return response;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "", received = 0;
  try {
    while (true) {
      const {value,done} = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > 32_000_000) throw new Error("ChatGPT response exceeded the supported size");
      pending += decoder.decode(value,{stream:true}).replace(/\r\n/g,"\n");
      let boundary: number;
      while ((boundary = pending.indexOf("\n\n")) !== -1) {
        const frame = pending.slice(0,boundary); pending = pending.slice(boundary+2);
        const data = frame.split("\n").filter(line=>line.startsWith("data:")).map(line=>line.slice(5).trimStart()).join("\n");
        if (!data || data === "[DONE]") continue;
        const event = JSON.parse(data);
        if (event.type === "response.completed") {
          const headers = new Headers(response.headers); headers.set("Content-Type","application/json"); headers.delete("Content-Length"); headers.delete("Content-Encoding");
          return new Response(JSON.stringify(event.response),{status:200,headers});
        }
        if (["response.failed","response.incomplete","error"].includes(event.type)) {
          const code = event.response?.error?.code || event.error?.code || event.code || "chatgpt_response_incomplete";
          return Response.json({error:{code,message:code === "subscription_sharing_usage_limit_exceeded" ? "Your ChatGPT plan usage limit was reached. Try later or choose another provider." : "ChatGPT did not complete the response. Retry or check your connection."}},{status:code.includes("usage_limit")?429:502});
        }
      }
    }
    throw new Error("ChatGPT stream ended before response.completed");
  } finally { await reader.cancel().catch(()=>{}); }
}
