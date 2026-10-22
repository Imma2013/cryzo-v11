import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { encryptProviderSecret, decryptProviderSecret } from "./provider-secrets";
const issuer = "https://auth.openai.com";
const tokenEndpoint = issuer + "/api/accounts/oauth/token";
const resource = "https://api.openai.com/v1";
const jwks = createRemoteJWKSet(new URL(issuer + "/.well-known/jwks.json"));
const db = (api as any).chatgptConnections;
export const CHATGPT_COOKIE = "__Host-cryzo-chatgpt-oauth";
export function hashValue(value: string) { return createHash("sha256").update(value).digest("base64url"); }
function secret() { const value=process.env.CRYZO_INTERNAL_API_SECRET; if(!value)throw new Error("ChatGPT connection storage is not configured");return value; }
export function chatgptConfiguration() {
  const clientId=process.env.OPENAI_CHATGPT_CLIENT_ID?.trim() || "";
  const usageScope=process.env.OPENAI_CHATGPT_USAGE_SCOPE?.trim() || "";
  const redirectUri=process.env.OPENAI_CHATGPT_REDIRECT_URI?.trim() || "";
  const method=process.env.OPENAI_CHATGPT_AUTH_METHOD || "client_secret_basic";
  const clientSecret=process.env.OPENAI_CHATGPT_CLIENT_SECRET || "";
  const approved=process.env.CRYZO_CHATGPT_HOSTED_APPROVED === "true";
  let validRedirect=false;try {const url=new URL(redirectUri);validRedirect=url.protocol==="https:" && url.pathname==="/api/chatgpt/callback" && !url.search && !url.hash;}catch {}
  const configured=approved && /^oaiapp_[a-zA-Z0-9_-]+$/.test(clientId) && validRedirect && !!usageScope && !/\s/.test(usageScope) && !["openid","profile","email","offline_access"].includes(usageScope) && ["none","client_secret_basic"].includes(method) && (method!=="client_secret_basic" || !!clientSecret) && !!process.env.CRYZO_SECRETS_KEY && !!process.env.CRYZO_INTERNAL_API_SECRET;
  return {configured,approved,clientId,usageScope,redirectUri,method,clientSecret,scopes:["openid","profile","email","offline_access","resource.invoke",usageScope].filter(Boolean).join(" ")};
}
export function requireChatGPTConfiguration() { const cfg=chatgptConfiguration();if(!cfg.configured)throw new Error("ChatGPT plan connection is awaiting hosted approval and configuration. Use your current provider meanwhile.");return cfg; }
type Attempt={verifier:string;nonce:string;redirectUri:string};
type Credentials={access_token:string;refresh_token?:string;scope:string;expiresAt:number;subject:string;email?:string};
function validateScopes(scope: unknown) {const cfg=requireChatGPTConfiguration(); if(typeof scope!=="string" || !scope.split(/\s+/).includes(cfg.usageScope))throw new Error("ChatGPT plan permission was not granted. Connect again and approve plan usage."); return scope;}
async function exchange(values: Record<string,string>) {
  const cfg=requireChatGPTConfiguration();
  const headers:Record<string,string>={"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"};
  if(cfg.method==="client_secret_basic") { const encode=(value:string)=>new URLSearchParams({value}).toString().slice(6);headers.Authorization="Basic "+Buffer.from(encode(cfg.clientId)+":"+encode(cfg.clientSecret)).toString("base64"); }
  const response=await fetch(tokenEndpoint,{method:"POST",headers,body:new URLSearchParams({...values,client_id:cfg.clientId,resource}),signal:AbortSignal.timeout(15_000),cache:"no-store"});
  const data=await response.json();
  if(!response.ok || typeof data.access_token!=="string" || (data.token_type && String(data.token_type).toLowerCase()!=="bearer")) throw new Error("ChatGPT authorization expired or was declined. Reconnect ChatGPT.");
  return data as {access_token:string;refresh_token?:string;id_token?:string;scope?:string;expires_in?:number};
}
export async function beginChatGPTConnection(userId: string) {
  const cfg=requireChatGPTConfiguration();
  const browser=randomBytes(32).toString("base64url"),state=randomBytes(32).toString("base64url"),verifier=randomBytes(64).toString("base64url"),nonce=randomBytes(32).toString("base64url");
  await fetchMutation(db.begin,{internalSecret:secret(),userId:userId as Id<"users">,browserHash:hashValue(browser),stateHash:hashValue(state),...encryptProviderSecret(JSON.stringify({verifier,nonce,redirectUri:cfg.redirectUri} satisfies Attempt))});
  const url=new URL(issuer+"/api/accounts/authorize");url.search=new URLSearchParams({client_id:cfg.clientId,redirect_uri:cfg.redirectUri,response_type:"code",scope:cfg.scopes,resource,state,nonce,code_challenge:hashValue(verifier),code_challenge_method:"S256"}).toString();
  return {browser,url:url.toString()};
}
export async function completeChatGPTConnection(browser:string, callback:URL) {
  const cfg=requireChatGPTConfiguration();
  const row=await fetchMutation(db.consume,{internalSecret:secret(),browserHash:hashValue(browser),stateHash:hashValue(callback.searchParams.get("state") || "")});
  if(!row)throw new Error("ChatGPT sign-in could not be verified. Start a new connection.");
  if(callback.searchParams.has("error"))throw new Error("ChatGPT connection was declined. Try connecting again.");
  const code=callback.searchParams.get("code");if(!code)throw new Error("ChatGPT sign-in returned no authorization code.");
  const attempt=JSON.parse(decryptProviderSecret(row)) as Attempt;
  if(attempt.redirectUri!==cfg.redirectUri || callback.origin+callback.pathname!==cfg.redirectUri)throw new Error("ChatGPT callback does not match the registered URL.");
  const token=await exchange({grant_type:"authorization_code",code,code_verifier:attempt.verifier,redirect_uri:attempt.redirectUri});
  if(!token.id_token)throw new Error("ChatGPT returned no identity token.");
  const {payload}=await jwtVerify(token.id_token,jwks,{issuer,audience:cfg.clientId,requiredClaims:["sub","exp","iat"],clockTolerance:5});
  if(payload.nonce!==attempt.nonce || !payload.sub)throw new Error("ChatGPT identity could not be verified.");
  const scope=validateScopes(token.scope);
  const credentials:Credentials={access_token:token.access_token,refresh_token:token.refresh_token,scope,expiresAt:Date.now()+Math.min(86_400,Math.max(1,Number(token.expires_in)||3600))*1000,subject:payload.sub,email:typeof payload.email==="string"?payload.email:undefined};
  await fetchMutation(db.save,{internalSecret:secret(),userId:row.userId,subject:credentials.subject,...(credentials.email?{email:credentials.email}:{}),expiresAt:credentials.expiresAt,...encryptProviderSecret(JSON.stringify(credentials))});
}
export async function chatgptConnectionRow(userId:string) { return fetchQuery(db.read,{internalSecret:secret(),userId:userId as Id<"users">}); }
export async function chatgptAccessToken(userId:string) {
  requireChatGPTConfiguration();const row=await chatgptConnectionRow(userId);if(!row)throw new Error("Connect ChatGPT in Apps before using your plan.");
  let value=JSON.parse(decryptProviderSecret(row)) as Credentials;validateScopes(value.scope);
  if(value.expiresAt>Date.now()+60_000)return value.access_token;
  if(!value.refresh_token)throw new Error("Your ChatGPT connection expired. Reconnect in Apps.");
  const lease=await fetchMutation(db.leaseRefresh,{internalSecret:secret(),userId:row.userId,version:row.version});
  if(!lease)throw new Error("ChatGPT connection is refreshing. Retry in a moment.");
  const refreshed=await exchange({grant_type:"refresh_token",refresh_token:value.refresh_token});
  value={...value,access_token:refreshed.access_token,refresh_token:refreshed.refresh_token || value.refresh_token,scope:validateScopes(refreshed.scope || value.scope),expiresAt:Date.now()+Math.min(86_400,Math.max(1,Number(refreshed.expires_in)||3600))*1000};
  await fetchMutation(db.save,{internalSecret:secret(),userId:row.userId,subject:row.subject,...(row.email?{email:row.email}:{}),expiresAt:value.expiresAt,expectedVersion:row.version,...encryptProviderSecret(JSON.stringify(value))});
  return value.access_token;
}
export async function chatgptModels(accessToken:string) {
  const response=await fetch(resource+"/models",{headers:{Authorization:"Bearer "+accessToken},signal:AbortSignal.timeout(15_000),cache:"no-store"});
  if(!response.ok)throw new Error("Unable to load your ChatGPT models. Check the connection in Apps.");
  const data=await response.json() as {models?:{slug:string;display_name:string;visibility:string}[]};
  return (data.models || []).filter(model=>model.visibility==="list" && typeof model.slug==="string").map(model=>({id:model.slug,name:model.display_name || model.slug}));
}
