/** The plan route has different capabilities from API-key inference. */
export function chatgptRequestBody(input: Record<string, unknown>) {
  if (!Array.isArray(input.input)) throw new Error("ChatGPT requires an input array");
  const tools=input.tools;
  if (tools !== undefined && (!Array.isArray(tools) || tools.some(tool=>!tool || !["function","custom"].includes(tool.type)))) throw new Error("This tool requires API-key inference. ChatGPT supports Cryzo function tools only.");
  const allowed=["model","input","instructions","tools","tool_choice","reasoning","text","include","parallel_tool_calls"];
  const body:Record<string,unknown>={};for(const name of allowed)if(input[name]!==undefined)body[name]=input[name];
  return {...body,store:false,stream:true};
}
