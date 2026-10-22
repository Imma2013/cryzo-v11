import { NextRequest, NextResponse } from "next/server";
/** Dedicated capability host keeps Metro's absolute paths and cookies isolated. */
export function proxy(req:NextRequest){
 const domain=process.env.CRYZO_EXPO_PREVIEW_DOMAIN?.trim().toLowerCase();
 const host=req.nextUrl.hostname.toLowerCase();
 if(!domain || !host.endsWith("."+domain))return NextResponse.next();
 const id=host.slice(0,-domain.length-1);if(!/^[a-f0-9]{32}$/.test(id))return new NextResponse("Unknown preview",{status:404});
 const target=req.nextUrl.clone();target.pathname="/api/preview/expo/t/"+id+(req.nextUrl.pathname==="/"?"":req.nextUrl.pathname);
 return NextResponse.rewrite(target);
}
export const config={matcher:["/:path*"]};
