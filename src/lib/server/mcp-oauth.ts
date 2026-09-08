import { createHash, randomBytes } from "node:crypto";
import {
  decryptProviderSecret,
  encryptProviderSecret,
} from "@/lib/server/provider-secrets";
import { assertPublicMcpUrl } from "@/lib/server/mcp-client";

export type McpOauthState = {
  serverId: string;
  userId: string;
  authToken: string;
  verifier: string;
  redirectUri: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  tokenEndpointAuthMethod?: string;
  resource?: string;
  createdAt: number;
};

type ProtectedResourceMetadata = {
  resource?: string;
  authorization_servers?: string[];
};

type AuthorizationServerMetadata = {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  registration_endpoint?: string;
  code_challenge_methods_supported?: string[];
};

type RegisteredClient = {
  client_id?: string;
  client_secret?: string;
  token_endpoint_auth_method?: string;
};

function base64Url(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function parseWwwAuthenticateResourceMetadata(header: string | null) {
  if (!header) return "";
  const match = header.match(/resource_metadata=(?:"([^"]+)"|([^,\s]+))/i);
  return (match?.[1] || match?.[2] || "").trim();
}

async function safeJson(url: string, init?: RequestInit) {
  await assertPublicMcpUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: "error",
      headers: {
        Accept: "application/json",
        ...(init?.headers || {}),
      },
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    return data && typeof data === "object" ? data : null;
  } finally {
    clearTimeout(timer);
  }
}

function protectedResourceCandidates(serverUrl: string) {
  const resource = new URL(serverUrl);
  const candidates = new Set<string>();
  candidates.add(new URL("/.well-known/oauth-protected-resource", resource.origin).toString());
  const pathname = resource.pathname.replace(/\/$/, "");
  if (pathname && pathname !== "/") {
    candidates.add(
      new URL(`/.well-known/oauth-protected-resource${pathname}`, resource.origin).toString(),
    );
  }
  return [...candidates];
}

function authorizationMetadataCandidates(issuerValue: string) {
  const issuer = new URL(issuerValue);
  const pathname = issuer.pathname.replace(/\/$/, "");
  const candidates = new Set<string>();
  candidates.add(
    new URL(
      `/.well-known/oauth-authorization-server${pathname === "/" ? "" : pathname}`,
      issuer.origin,
    ).toString(),
  );
  candidates.add(new URL("/.well-known/oauth-authorization-server", issuer.origin).toString());
  candidates.add(
    new URL(
      `/.well-known/openid-configuration${pathname === "/" ? "" : pathname}`,
      issuer.origin,
    ).toString(),
  );
  candidates.add(new URL("/.well-known/openid-configuration", issuer.origin).toString());
  return [...candidates];
}

async function discoverProtectedResource(serverUrl: string) {
  await assertPublicMcpUrl(serverUrl);
  let advertised = "";
  try {
    const probe = await fetch(serverUrl, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "cryzo-oauth-probe",
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "Cryzo", version: "1.0.0" },
        },
      }),
    });
    advertised = parseWwwAuthenticateResourceMetadata(
      probe.headers.get("www-authenticate"),
    );
  } catch {
    // Fall back to standardized well-known locations below.
  }

  const candidates = advertised
    ? [advertised, ...protectedResourceCandidates(serverUrl)]
    : protectedResourceCandidates(serverUrl);
  for (const candidate of candidates) {
    try {
      const metadata = (await safeJson(candidate)) as ProtectedResourceMetadata | null;
      if (metadata?.authorization_servers?.length) return metadata;
    } catch {
      // Try the next standards-compliant location.
    }
  }
  throw new Error(
    "This MCP server does not advertise OAuth protected-resource metadata.",
  );
}

async function discoverAuthorizationServer(issuer: string) {
  for (const candidate of authorizationMetadataCandidates(issuer)) {
    try {
      const metadata = (await safeJson(candidate)) as AuthorizationServerMetadata | null;
      if (metadata?.authorization_endpoint && metadata?.token_endpoint) {
        await assertPublicMcpUrl(metadata.authorization_endpoint);
        await assertPublicMcpUrl(metadata.token_endpoint);
        if (metadata.registration_endpoint) {
          await assertPublicMcpUrl(metadata.registration_endpoint);
        }
        return metadata;
      }
    } catch {
      // Try the next discovery URL.
    }
  }
  throw new Error("Unable to discover this MCP server's OAuth endpoints.");
}

async function registerClient(registrationEndpoint: string, redirectUri: string) {
  const data = (await safeJson(registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Cryzo",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      application_type: "web",
    }),
  })) as RegisteredClient | null;
  if (!data?.client_id) {
    throw new Error("The MCP OAuth server could not register Cryzo as a client.");
  }
  return data;
}

export async function beginMcpOAuth(serverUrl: string, redirectUri: string) {
  const resourceMetadata = await discoverProtectedResource(serverUrl);
  const issuer = resourceMetadata.authorization_servers?.[0];
  if (!issuer) throw new Error("The MCP server did not provide an authorization server.");
  await assertPublicMcpUrl(issuer);
  const metadata = await discoverAuthorizationServer(issuer);
  if (!metadata.registration_endpoint) {
    throw new Error(
      "This MCP OAuth provider does not support dynamic client registration yet.",
    );
  }

  const client = await registerClient(metadata.registration_endpoint, redirectUri);
  const verifier = base64Url(randomBytes(48));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());

  return {
    authorizationEndpoint: metadata.authorization_endpoint!,
    tokenEndpoint: metadata.token_endpoint!,
    clientId: client.client_id!,
    clientSecret: client.client_secret,
    tokenEndpointAuthMethod: client.token_endpoint_auth_method || "none",
    verifier,
    challenge,
    resource: resourceMetadata.resource || serverUrl,
  };
}

export function encodeMcpOauthState(payload: McpOauthState) {
  const encrypted = encryptProviderSecret(JSON.stringify(payload));
  return base64Url(Buffer.from(JSON.stringify(encrypted), "utf8"));
}

export function decodeMcpOauthState(value: string): McpOauthState {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const encrypted = JSON.parse(
    Buffer.from(normalized + padding, "base64").toString("utf8"),
  ) as { ciphertext: string; iv: string; tag: string };
  const payload = JSON.parse(decryptProviderSecret(encrypted)) as McpOauthState;
  if (!payload?.serverId || !payload?.authToken || !payload?.tokenEndpoint) {
    throw new Error("Invalid MCP OAuth state.");
  }
  if (Date.now() - payload.createdAt > 10 * 60 * 1000) {
    throw new Error("MCP OAuth state expired. Start the connection again.");
  }
  return payload;
}
