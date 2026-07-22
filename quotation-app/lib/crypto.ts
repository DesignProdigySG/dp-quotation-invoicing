import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function getKey(envVarName: string): Buffer {
  const raw = process.env[envVarName];
  if (!raw) throw new Error(`${envVarName} is not set`);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`${envVarName} must decode to 32 bytes`);
  }
  return key;
}

// Output format: base64(iv) + ":" + base64(authTag) + ":" + base64(ciphertext)
export function encrypt(plaintext: string, envVarName = "GMAIL_TOKEN_ENCRYPTION_KEY"): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(envVarName), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decrypt(payload: string, envVarName = "GMAIL_TOKEN_ENCRYPTION_KEY"): string {
  const [ivB64, authTagB64, ciphertextB64] = payload.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted payload");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(envVarName), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
