import QRCode from "qrcode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** No external QR gateway: keep Expo tunnel links in Cryzo. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const value = searchParams.get("data")?.trim() || "";
  if (!/^exps?:\/\/[^\s]+$/i.test(value) || value.length > 2048) {
    return Response.json({ error: "Invalid Expo preview URL" }, { status: 400 });
  }
  try {
    const svg = await QRCode.toString(value, {
      type: "svg", width: 320, margin: 3, errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#ffffff" },
    });
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "private, max-age=30",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "Expo QR generation failed" }, { status: 500 });
  }
}
