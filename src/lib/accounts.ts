"use client";

/**
 * Accounts this browser has signed into, and the PIN-unlock token for each.
 *
 * This list lives only in the browser that created it. Nothing is published to
 * anonymous visitors: a stranger opening the login URL sees a plain form,
 * because the server has no endpoint that lists users without a session. That
 * keeps the convenience of an account picker without handing out valid
 * usernames to anyone who finds the address.
 */

const STORAGE_KEY = "laundroweb.accounts";

export type RememberedAccount = {
  email: string;
  name: string;
  /** Present only once a PIN has been set up on this browser. */
  deviceToken?: string;
};

export function loadAccounts(): RememberedAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is RememberedAccount =>
        typeof a === "object" && a !== null && typeof (a as RememberedAccount).email === "string"
    );
  } catch {
    // Private browsing, cleared storage or corrupted JSON: fall back to the
    // plain login form rather than breaking the page.
    return [];
  }
}

function save(accounts: RememberedAccount[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    /* storage unavailable — the picker simply will not persist */
  }
}

export function rememberAccount(account: RememberedAccount): void {
  const existing = loadAccounts();
  const previous = existing.find((a) => a.email === account.email);
  const merged: RememberedAccount = {
    ...previous,
    ...account,
    // Never drop an existing device token just because this login was a
    // password sign-in that did not carry one.
    deviceToken: account.deviceToken ?? previous?.deviceToken,
  };
  save([merged, ...existing.filter((a) => a.email !== account.email)]);
}

export function forgetAccount(email: string): void {
  save(loadAccounts().filter((a) => a.email !== email));
}
