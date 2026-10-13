#!/usr/bin/env node
/**
 * End-to-end smoke test run against a live, running instance of the app.
 *
 * This exists because of a real incident: a login-throttle change passed
 * `tsc --noEmit` and `next build` cleanly while silently breaking every
 * login in the app (NextAuth hands `authorize()` a plain object of headers,
 * not a `Headers` instance, and a bad cast around that threw on every
 * attempt). Neither the typecheck nor the build would ever catch that class
 * of bug — only actually signing in against a running server does. That is
 * what this script does, using nothing but fetch, so it needs no browser and
 * no extra dependency.
 *
 * Run after the app is built, its schema is pushed to a real database, and
 * `prisma/seed.ts` has been run with SEED_OWNER_PASSWORD / SEED_STAFF_PASSWORD
 * set — those are exactly the two accounts this script signs in as.
 */

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const OWNER_EMAIL = "owner@laundromat.local";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD;
const STAFF_EMAIL = "staff@laundromat.local";
const STAFF_PASSWORD = process.env.SEED_STAFF_PASSWORD;

if (!OWNER_PASSWORD || !STAFF_PASSWORD) {
  console.error(
    "SEED_OWNER_PASSWORD and SEED_STAFF_PASSWORD must be set to the same " +
      "values the CI job seeded the database with."
  );
  process.exit(1);
}

let failures = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

/**
 * Node's fetch correctly exposes multiple Set-Cookie headers via
 * getSetCookie() (Headers.get() would incorrectly join them with commas,
 * which breaks on a cookie whose value contains one, such as an Expires
 * date). Falls back gracefully if it's ever unavailable.
 */
function cookieHeader(res) {
  const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  return raw.map((c) => c.split(";")[0]).join("; ");
}

async function getCsrf() {
  const res = await fetch(`${BASE}/api/auth/csrf`);
  const cookie = cookieHeader(res);
  const { csrfToken } = await res.json();
  return { csrfToken, cookie };
}

/** Drives a real NextAuth credentials login and reports what actually resulted. */
async function attemptLogin(email, password) {
  const { csrfToken, cookie: csrfCookie } = await getCsrf();
  const body = new URLSearchParams({ email, password, csrfToken, json: "true" });

  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: csrfCookie },
    body,
    redirect: "manual",
  });

  const cookie = [csrfCookie, cookieHeader(res)].filter(Boolean).join("; ");
  const session = await (await fetch(`${BASE}/api/auth/session`, { headers: { cookie } })).json();
  return { session, cookie };
}

async function main() {
  console.log(`Smoke testing ${BASE}\n`);

  console.log("Wrong password is rejected:");
  const wrong = await attemptLogin(OWNER_EMAIL, "definitely-not-the-password");
  check("no session issued", !wrong.session?.user);

  console.log("\nCorrect password signs in:");
  const right = await attemptLogin(OWNER_EMAIL, OWNER_PASSWORD);
  check("session issued", Boolean(right.session?.user));
  check("session belongs to the right account", right.session?.user?.email === OWNER_EMAIL);

  console.log("\nA session actually gates a protected API:");
  const authed = await fetch(`${BASE}/api/expenses`, { headers: { cookie: right.cookie } });
  check("200 with a session", authed.status === 200, `got ${authed.status}`);

  const anon = await fetch(`${BASE}/api/expenses`);
  check("401 with no session", anon.status === 401, `got ${anon.status}`);


  console.log("\nCompliance lifecycle and source isolation:");
  const ownerHeaders = { cookie: right.cookie, "Content-Type": "application/json", Origin: BASE };
  const noSession = await fetch(`${BASE}/api/compliance`);
  check("compliance rejects anonymous requests", noSession.status === 401);
  const staff = await attemptLogin(STAFF_EMAIL, STAFF_PASSWORD);
  const forbidden = await fetch(`${BASE}/api/compliance`, { headers: { cookie: staff.cookie } });
  check("compliance rejects staff access", forbidden.status === 403);
  const created = await fetch(`${BASE}/api/compliance`, { method: "POST", headers: ownerHeaders,
    body: JSON.stringify({ title: "CI PCI renewal", dueDate: "2027-10-27", deadlineType: "pci_compliance", recurrence: "yearly" }) });
  check("owner can create a compliance deadline", created.status === 201);
  const deadline = await created.json();
  if (deadline.id) {
    const sourceHeaders = { "X-Compliance-Token": process.env.COMPLIANCE_SERVICE_TOKEN };
    const readSnapshot = async () => {
      const res = await fetch(`${BASE}/api/integrations/compliance?tenant_id=laundroweb`, { headers: sourceHeaders });
      check("dedicated key reads the snapshot", res.status === 200);
      return res.json();
    };
    const initial = await readSnapshot();
    check("snapshot preserves the civil date", initial.deadlines?.some(d => d.id === deadline.id && d.due_date === "2027-10-27"));
    const crossBusiness = await fetch(`${BASE}/api/integrations/compliance?tenant_id=another`, { headers: sourceHeaders });
    check("snapshot rejects another business", crossBusiness.status === 403);
    const sourceWrite = await fetch(`${BASE}/api/compliance/${deadline.id}`, { method: "PATCH", headers: { ...sourceHeaders, "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify({status:"completed"}) });
    check("source token cannot write", sourceWrite.status === 401);
    for (const status of ["completed", "pending", "completed"]) {
      const changed = await fetch(`${BASE}/api/compliance/${deadline.id}`, { method:"PATCH", headers:ownerHeaders, body:JSON.stringify({status}) });
      check(`owner status change ${status}`, changed.status === 200);
    }
    const completed = await readSnapshot();
    check("completion reaches the snapshot", completed.deadlines?.some(d => d.id === deadline.id && d.status === "completed"));
    const renewals = completed.deadlines?.filter(d => d.title === "CI PCI renewal" && d.due_date === "2028-10-27") || [];
    check("reopen/recomplete creates exactly one renewal", renewals.length === 1);
    for (const id of [deadline.id, ...renewals.map(d => d.id)]) {
      await fetch(`${BASE}/api/compliance/${id}`, {method:"DELETE",headers:ownerHeaders});
    }
    const removed = await readSnapshot();
    check("deleted deadline disappears from the snapshot", !removed.deadlines?.some(d => d.id === deadline.id));
  }

  console.log("\nRepeated failures lock the account:");
  for (let i = 0; i < 5; i++) {
    await attemptLogin(STAFF_EMAIL, `wrong-${i}`);
  }
  const stillLocked = await attemptLogin(STAFF_EMAIL, STAFF_PASSWORD);
  check("correct password refused while locked", !stillLocked.session?.user);

  console.log(`\n${failures === 0 ? "All smoke checks passed." : `${failures} smoke check(s) FAILED.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
