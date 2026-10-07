const BASE = "https://m.fascard.com";

// In-process token cache — shared across requests within the same server
// instance. The real expiry isn't documented, so this is a conservative
// window; getFascard()/postFascard() also refetch once on a 401 regardless.
const TOKEN_TTL_MS = 10 * 60 * 1000;
let cachedToken: { value: string; expiry: number } | null = null;

export function fascardConfigured(): boolean {
  return !!(process.env.FASCARD_USERNAME && process.env.FASCARD_PASSWORD && process.env.FASCARD_LOCATION_ID);
}

export function fascardLocationId(): string {
  return process.env.FASCARD_LOCATION_ID ?? "";
}

async function fetchToken(): Promise<string> {
  const username = process.env.FASCARD_USERNAME!;
  const password = process.env.FASCARD_PASSWORD!;

  const res = await fetch(`${BASE}/api/AuthToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ UserName: username, Password: password }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FasCard auth failed: ${res.status} ${text}`.trim());
  }

  const data = await res.json();
  if (!data?.Token) throw new Error("FasCard auth response had no Token field");

  cachedToken = { value: data.Token, expiry: Date.now() + TOKEN_TTL_MS };
  return cachedToken.value;
}

async function getToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && Date.now() < cachedToken.expiry) return cachedToken.value;
  return fetchToken();
}

async function request(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
  if (!fascardConfigured()) throw new Error("FasCard is not configured");

  const doRequest = async (token: string) =>
    fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let token = await getToken();
  let res = await doRequest(token);

  // The documented token lifetime is unknown, so a 401 here is treated as
  // "the cached token expired" and retried once with a fresh one, rather
  // than assumed to be a real auth failure.
  if (res.status === 401) {
    token = await getToken(true);
    res = await doRequest(token);
  }

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message = typeof json === "object" && json && "Message" in json ? (json as { Message: string }).Message : text;
    throw new Error(`FasCard ${method} ${path} failed: ${res.status} ${message}`.trim());
  }

  return json;
}

export function fascardGet(path: string): Promise<unknown> {
  return request("GET", path);
}

export function fascardPost(path: string, body: unknown): Promise<unknown> {
  return request("POST", path, body);
}
