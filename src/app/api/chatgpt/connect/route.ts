import { NextResponse } from "next/server";
import { requireRequestUserId } from "@/lib/server/request-user";
import { beginChatGPTConnection, CHATGPT_COOKIE } from "@/lib/server/chatgpt-connection";
export const runtime="nodejs";
export async function POST(req:Request) {
  const userId=await requireRequestUserId(req);if(!userId)return NextResponse.json({error:"Sign in to Cryzo"},{status:401});
  try {
    const started=await beginChatGPTConnection(userId);
    const response=NextResponse.json({url:started.url});
    response.cookies.set(CHATGPT_COOKIE,started.browser,{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:600});
    response.headers.set("Cache-Control","no-store");return response;
  }catch {return NextResponse.json({error:"ChatGPT plan connection is not available yet. Check Apps for its status."},{status:503});}
}
