const BASE = "https://m.fascard.com";

// In-process token cache — shared across requests within the same server
// instance. The real expiry isn't documented, so this is a conservative
// window; getFascard()/postFascard() also refetch once on a 401 regardless.
const TOKEN_TTL_MS = 10 * 60 * 1000;
let cachedToken: { value: string; expiry: number } | null = null;

export function fascardConfigured(): boolean {
  return !!(
    process.env.FASCARD_USERNAME &&
    process.env.FASCARD_PASSWORD &&
    process.env.FASCARD_LOCATION_ID &&
    process.env.FASCARD_ACCOUNT_ID
  );
}

export function fascardLocationId(): string {
  return process.env.FASCARD_LOCATION_ID ?? "";
}

export function fascardAccountId(): string {
  return process.env.FASCARD_ACCOUNT_ID ?? "";
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

export type FascardTransaction = {
  ID: number;
  DateTime: string; // UTC
  TransType: number;
  TransSubType: number;
  LocationID: number;
  MachNo: number | null;
  CashAmount: number;
  CreditCardAmount: number;
};

// Per CCI's Transaction Types & SubTypes reference: TransType 100 is "Vend
// sale", and SubType 0 is specifically a machine start (1 = credit card
// surcharge line item, 2 = point of sale -- neither is a machine running).
export const TURN_TRANS_TYPE = 100;
export const TURN_TRANS_SUBTYPE = 0;

const TRANSACT_PAGE_SIZE = 500;
const TRANSACT_MAX_PAGES = 20; // safety cap: 10,000 transactions

/**
 * Fetches FasCard transactions back to `sinceUTC`, paginating with the
 * documented lastID/Older cursor. There is no date-range query parameter --
 * CCI's API only supports paging by transaction ID -- so this walks pages
 * newest-first until a page's oldest transaction predates the cutoff, or
 * the safety cap is hit.
 *
 * The exact direction `lastID`/`Older` page in is not spelled out in CCI's
 * docs beyond the field names, so this assumes the conventional reading:
 * the first call (no lastID) returns the most recent transactions, and
 * passing the lowest ID seen so far as `lastID` with `Older: true` continues
 * further back in time. `diagnostics` reports what was actually observed
 * (page count, ID and date range) so a caller can tell if that assumption
 * held or the results look wrong.
 */
export async function fascardRecentTransactions(sinceUTC: Date): Promise<{
  transactions: FascardTransaction[];
  diagnostics: {
    pagesFetched: number;
    hitPageCap: boolean;
    oldestSeen: string | null;
    newestSeen: string | null;
  };
}> {
  const accountId = fascardAccountId();
  const all: FascardTransaction[] = [];
  let lastId: number | null = null;
  let pagesFetched = 0;
  let hitPageCap = false;

  for (let page = 0; page < TRANSACT_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      AccountID: accountId,
      UserAccountID: "0",
      Limit: String(TRANSACT_PAGE_SIZE),
    });
    if (lastId !== null) {
      params.set("lastID", String(lastId));
      params.set("Older", "true");
    }

    const result = await fascardGet(`/api/Transact?${params.toString()}`);
    const batch: FascardTransaction[] = Array.isArray(result)
      ? result
      : Array.isArray((result as { Transactions?: unknown })?.Transactions)
      ? (result as { Transactions: FascardTransaction[] }).Transactions
      : [];

    pagesFetched++;
    if (batch.length === 0) break;

    all.push(...batch);
    const oldestInBatch = batch.reduce((min, t) => (t.ID < min ? t.ID : min), batch[0].ID);
    const oldestDateInBatch = batch.reduce(
      (min, t) => (t.DateTime < min ? t.DateTime : min),
      batch[0].DateTime
    );

    if (oldestDateInBatch < sinceUTC.toISOString()) break;
    if (batch.length < TRANSACT_PAGE_SIZE) break; // short page: no more data

    lastId = oldestInBatch;

    if (page === TRANSACT_MAX_PAGES - 1) hitPageCap = true;
  }

  const inWindow = all.filter((t) => t.DateTime >= sinceUTC.toISOString());
  const dates = all.map((t) => t.DateTime).sort();

  return {
    transactions: inWindow,
    diagnostics: {
      pagesFetched,
      hitPageCap,
      oldestSeen: dates[0] ?? null,
      newestSeen: dates[dates.length - 1] ?? null,
    },
  };
}
