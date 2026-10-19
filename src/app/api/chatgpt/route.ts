import { NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import { requireRequestUserId } from "@/lib/server/request-user";
import { chatgptConfiguration, chatgptConnectionRow, chatgptAccessToken, chatgptModels } from "@/lib/server/chatgpt-connection";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const userId=await requireRequestUserId(req);if(!userId)return NextResponse.json({error:"Sign in to Cryzo"},{status:401});
  const cfg=chatgptConfiguration();
  if(!cfg.configured)return NextResponse.json({enabled:false,connected:false,reason:"ChatGPT plan connection is awaiting hosted approval and configuration."},{headers:{"Cache-Control":"no-store"}});
  try {
    const row=await chatgptConnectionRow(userId);
    if(!row)return NextResponse.json({enabled:true,connected:false,models:[]});
    const models=await chatgptModels(await chatgptAccessToken(userId));
    return NextResponse.json({enabled:true,connected:true,email:row.email,models},{headers:{"Cache-Control":"no-store"}});
  }catch {return NextResponse.json({enabled:true,connected:false,reason:"Your ChatGPT connection needs attention. Reconnect in Apps."},{status:200});}
}
export async function DELETE(req:Request) {
  const userId=await requireRequestUserId(req);if(!userId)return NextResponse.json({error:"Sign in to Cryzo"},{status:401});
  const token=req.headers.get("authorization")!.slice(7);
  await fetchMutation((api as any).chatgptConnections.disconnect,{}, {token});
  return NextResponse.json({disconnected:true});
}
