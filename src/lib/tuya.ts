import { createHash, createHmac } from "crypto";

const REGION = process.env.TUYA_REGION ?? "us";
const BASE = `https://openapi.tuya${REGION}.com`;

// In-process token cache — shared across requests within the same server instance
let cachedToken: { value: string; expiry: number } | null = null;

function sign(
  clientId: string,
  secret: string,
  accessToken: string,
  t: number,
  nonce: string,
  method: string,
  urlPath: string,
  body = ""
): string {
  const contentHash = createHash("sha256").update(body).digest("hex");
  const stringToSign = `${method.toUpperCase()}\n${contentHash}\n\n${urlPath}`;
  const signStr = `${clientId}${accessToken}${t}${nonce}${stringToSign}`;
  return createHmac("sha256", secret).update(signStr).digest("hex").toUpperCase();
}

function headers(clientId: string, secret: string, accessToken: string, method: string, path: string, body = "") {
  const t = Date.now();
  const nonce = "";
  return {
    "client_id": clientId,
    "access_token": accessToken,
    "t": String(t),
    "nonce": nonce,
    "sign_method": "HMAC-SHA256",
    "sign": sign(clientId, secret, accessToken, t, nonce, method, path, body),
    "Content-Type": "application/json",
    "lang": "en",
  };
}

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiry) return cachedToken.value;

  const clientId = process.env.TUYA_CLIENT_ID!;
  const secret = process.env.TUYA_CLIENT_SECRET!;
  const path = "/v1.0/token?grant_type=1";

  const res = await fetch(`${BASE}${path}`, {
    headers: headers(clientId, secret, "", "GET", path),
  });
  const data = await res.json();
  if (!data.success) throw new Error(`Tuya token error: ${data.msg}`);

  cachedToken = {
    value: data.result.access_token,
    expiry: Date.now() + data.result.expire_time * 1000 - 60_000,
  };
  return cachedToken.value;
}

export async function tuyaGet(path: string) {
  const clientId = process.env.TUYA_CLIENT_ID!;
  const secret = process.env.TUYA_CLIENT_SECRET!;
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: headers(clientId, secret, token, "GET", path),
  });
  return res.json();
}

export async function tuyaPost(path: string, body: object) {
  const clientId = process.env.TUYA_CLIENT_ID!;
  const secret = process.env.TUYA_CLIENT_SECRET!;
  const token = await getToken();
  const bodyStr = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: headers(clientId, secret, token, "POST", path, bodyStr),
    body: bodyStr,
  });
  return res.json();
}

export function deviceIds(): string[] {
  return (process.env.TUYA_DEVICE_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function tuyaConfigured(): boolean {
  return !!(process.env.TUYA_CLIENT_ID && process.env.TUYA_CLIENT_SECRET && process.env.TUYA_DEVICE_IDS);
}
