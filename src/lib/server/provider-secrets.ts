import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../convex/_generated/api";

function masterKey() {
  const secret = process.env.CRYZO_SECRETS_KEY?.trim();
  if (!secret) {
    throw new Error("CRYZO_SECRETS_KEY is not configured on the Cryzo server");
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptProviderSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptProviderSecret(row: {
  ciphertext: string;
  iv: string;
  tag: string;
}) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    masterKey(),
    Buffer.from(row.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(row.tag, "base64"));
  const clear = Buffer.concat([
    decipher.update(Buffer.from(row.ciphertext, "base64")),
    decipher.final(),
  ]);
  return clear.toString("utf8");
}

export async function resolveAccountProviderSecret(
  authToken: string,
  providerId: string,
) {
  const row = await fetchQuery(
    (api as any).providerSecrets.get,
    { providerId },
    { token: authToken },
  );
  if (!row) return null;
  return {
    apiKey: decryptProviderSecret(row),
    baseURL: row.baseUrl as string | undefined,
  };
}
