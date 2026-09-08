export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const data = searchParams.get("data")?.trim() || "";

  if (!/^exps?:\/\//i.test(data) || data.length > 2048) {
    return Response.json({ error: "Invalid Expo preview URL" }, { status: 400 });
  }

  const upstream = new URL("https://api.qrserver.com/v1/create-qr-code/");
  upstream.searchParams.set("size", "320x320");
  upstream.searchParams.set("format", "png");
  upstream.searchParams.set("data", data);

  try {
    const response = await fetch(upstream, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return Response.json({ error: "Unable to render QR code" }, { status: 502 });
    }

    return new Response(await response.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") || "image/png",
        "Cache-Control": "private, max-age=60",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch {
    return Response.json({ error: "Unable to render QR code" }, { status: 502 });
  }
}
