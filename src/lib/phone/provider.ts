import { validSignature, phonePattern } from "./core";

export function providerReady() {
  return (
    /^AC[0-9a-fA-F]{32}$/.test(process.env.TWILIO_ACCOUNT_SID || "") &&
    !!process.env.TWILIO_AUTH_TOKEN &&
    phonePattern.test(process.env.TWILIO_PHONE_NUMBER || "") &&
    /^https:\/\/[^/?#]+$/.test(process.env.PHONE_PUBLIC_URL || "")
  );
}
export function phoneUrl(path: string) {
  const origin = process.env.PHONE_PUBLIC_URL;
  if (!origin || !/^https:\/\/[^/?#]+$/.test(origin))
    throw new Error(
      "Set PHONE_PUBLIC_URL to the HTTPS app origin without a trailing slash.",
    );
  return origin + path;
}
export async function authenticateWebhook(
  request: Request,
): Promise<URLSearchParams | null> {
  if (!providerReady()) return null;
  if (
    !request.headers
      .get("content-type")
      ?.includes("application/x-www-form-urlencoded")
  )
    return null;
  const text = await request.text();
  if (text.length > 65536) return null;
  const params = new URLSearchParams(text);
  const url = new URL(request.url);
  if (
    !validSignature(
      process.env.TWILIO_AUTH_TOKEN!,
      phoneUrl(url.pathname + url.search),
      params,
      request.headers.get("x-twilio-signature") || "",
    )
  )
    return null;
  if (
    params.has("AccountSid") &&
    params.get("AccountSid") !== process.env.TWILIO_ACCOUNT_SID
  )
    return null;
  return params;
}
export function providerAuth() {
  return (
    "Basic " +
    Buffer.from(
      `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`,
    ).toString("base64")
  );
}
export class TwilioCallError extends Error {
  constructor(public readonly status: number, public readonly code: number | null, detail: string) {
    super(`Twilio alert request failed: HTTP ${status}${code === null ? "" : `, code ${code}`}${detail ? `. ${detail}` : "."}`);
  }
  get definitelyRejected() { return this.status >= 400 && this.status < 500 && this.status !== 408; }
}
function safeProviderDetail(value: unknown): string {
  if (typeof value !== "string") return "";
  let text = value.slice(0, 1000);
  for (const secret of [process.env.TWILIO_AUTH_TOKEN, providerAuth()])
    if (secret) text = text.split(secret).join("[redacted]");
  return text.replace(/\+?\d[\d() -]{7,}\d/g, "[phone number]").slice(0, 500);
}
export async function placeAlertCall(to: string, attemptId: string) {
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Calls.json`,
    {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: providerAuth(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: to,
        From: process.env.TWILIO_PHONE_NUMBER!,
        Url: phoneUrl(`/api/phone/webhooks/alert?attempt=${attemptId}`),
        Method: "POST",
        StatusCallback: phoneUrl(
          `/api/phone/webhooks/status?attempt=${attemptId}`,
        ),
        StatusCallbackMethod: "POST",
        Timeout: "25",
        TimeLimit: "90",
      }),
    },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const code = Number.isInteger(error?.code) ? error.code as number : null;
    throw new TwilioCallError(response.status, code, safeProviderDetail(error?.message));
  }
  const result = await response.json();
  if (typeof result.sid !== "string" || !/^CA[0-9a-fA-F]{32}$/.test(result.sid))
    throw new Error("Telephone provider returned an invalid call identifier.");
  return result.sid as string;
}
