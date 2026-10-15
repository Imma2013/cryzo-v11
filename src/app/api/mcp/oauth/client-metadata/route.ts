export const dynamic = "force-dynamic";
export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return Response.json({
    client_id: origin + "/api/mcp/oauth/client-metadata",
    client_name: "Cryzo",
    redirect_uris: [origin + "/api/mcp/oauth/callback"],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"], token_endpoint_auth_method: "none",
  });
}
