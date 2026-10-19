import { NextRequest, NextResponse } from "next/server";
import { CHATGPT_COOKIE, completeChatGPTConnection, chatgptConfiguration } from "@/lib/server/chatgpt-connection";
export const runtime="nodejs";
export async function GET(req:NextRequest) {
  const cfg=chatgptConfiguration();
  const registered=cfg.redirectUri ? new URL(cfg.redirectUri).origin : req.nextUrl.origin;
  const destination=new URL("/chat/apps",registered);
  try {
    const browser=req.cookies.get(CHATGPT_COOKIE)?.value;
    if(!browser)throw new Error("Missing sign-in transaction");
    await completeChatGPTConnection(browser,new URL(req.url));
    destination.searchParams.set("chatgpt","connected");
  }catch {destination.searchParams.set("chatgpt","retry");}
  const response=NextResponse.redirect(destination);
  response.cookies.set(CHATGPT_COOKIE,"",{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:0});
  response.headers.set("Cache-Control","no-store");return response;
}
