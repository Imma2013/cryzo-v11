import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const logo = req.nextUrl.searchParams.get("url");

  if (!logo) {
    return Response.json({ error: "Missing logo URL" }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(logo);
  } catch {
    return Response.json({ error: "Invalid logo URL" }, { status: 400 });
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return Response.json({ error: "Unsupported logo URL" }, { status: 400 });
  }

  const upstream = await fetch(url, {
    headers: {
      Accept: "image/avif,image/webp,image/svg+xml,image/*,*/*;q=0.8",
    },
  });

  if (!upstream.ok) {
    return Response.json({ error: "Logo fetch failed" }, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "image/svg+xml";
  const image = await upstream.arrayBuffer();

  return new Response(image, {
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
