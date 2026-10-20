#!/usr/bin/env node
import { randomUUID, createHash } from "node:crypto";
import { wdfSmoke } from "./wdf-smoke.mjs";
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

  console.log("\nDelegated compliance verification boundary:");
  const workflowDeadline = await (await fetch(`${BASE}/api/compliance`, {method:"POST",headers:ownerHeaders,
    body:JSON.stringify({title:"CI delegated PCI",dueDate:"2027-10-27",deadlineType:"pci_compliance",recurrence:"yearly"})})).json();
  const peopleRes=await fetch(`${BASE}/api/integrations/compliance/people?tenant_id=laundroweb`,{headers:{"X-Compliance-Token":process.env.COMPLIANCE_SERVICE_TOKEN}});
  check("people lookup requires the read-only credential",peopleRes.status===200);
  const people=await peopleRes.json();
  const worker=people.people?.find(p=>p.name.includes("Staff"));
  check("staff identity is eligible for assignment",Boolean(worker));
  const obligation=randomUUID();
  const binding={version:1,event_id:randomUUID(),obligation_id:obligation,parent_obligation_id:null,revision:1,action:"bind",tenant_id:"laundroweb",record_id:workflowDeadline.id,
    expected_fingerprint:createHash("sha256").update(JSON.stringify(["CI delegated PCI","2027-10-27","","yearly"])).digest("hex"),owner_name:"CI owner",assignee_id:worker?.id||null,evidence_requirements:"Attach renewal receipt"};
  const apply=async(payload,token=process.env.COMPLIANCE_WORKFLOW_TOKEN)=>fetch(`${BASE}/api/integrations/compliance/workflow`,{method:"POST",headers:{"Content-Type":"application/json","X-Compliance-Workflow-Token":token},body:JSON.stringify(payload)});
  check("read-only key cannot bind or verify",(await apply(binding,process.env.COMPLIANCE_SERVICE_TOKEN)).status===401);
  check("wrong business is rejected",(await apply({...binding,tenant_id:"other"})).status===400);
  check("changed source fingerprint is rejected",(await apply({...binding,expected_fingerprint:"0".repeat(64)})).status===409);
  const bound=await apply(binding);check("workflow can bind existing duty",bound.status===200);
  for(const status of ["completed","cancelled","pending"]){
    const direct=await fetch(`${BASE}/api/compliance/${workflowDeadline.id}`,{method:"PATCH",headers:ownerHeaders,body:JSON.stringify({status})});
    check(`legacy ${status} cannot bypass owner verification`,direct.status===409);
  }
  check("delegated records cannot be deleted",(await fetch(`${BASE}/api/compliance/${workflowDeadline.id}`,{method:"DELETE",headers:ownerHeaders})).status===409);
  const verify={...binding,event_id:randomUUID(),action:"verify",revision:3};
  const verified=await apply(verify);check("workflow applies reviewed completion",verified.status===200);const acknowledgment=await verified.json();
  const retry=await apply(verify);const replay=await retry.json();check("same verification event is idempotent",retry.status===200&&replay.event_id===acknowledgment.event_id&&replay.obligation_id===acknowledgment.obligation_id&&replay.next_record_id===acknowledgment.next_record_id);
  const renewedSnapshot=await (await fetch(`${BASE}/api/integrations/compliance?tenant_id=laundroweb`,{headers:{"X-Compliance-Token":process.env.COMPLIANCE_SERVICE_TOKEN}})).json();
  const children=renewedSnapshot.deadlines?.filter(d=>d.parent_source_record_id===workflowDeadline.id)||[];
  check("one renewal is created and parent is exported",children.length===1&&children[0].due_date==="2028-10-27");
  const editVerified=await fetch(`${BASE}/api/compliance/${workflowDeadline.id}`,{method:"PATCH",headers:ownerHeaders,body:JSON.stringify({title:"Edited verified duty",dueDate:"2027-10-27",deadlineType:"pci_compliance",recurrence:"yearly"})});
  check("verified details are immutable",editVerified.status===409);
  if(children[0]){
    const bypass=await fetch(`${BASE}/api/compliance/${children[0].id}`,{method:"PATCH",headers:ownerHeaders,body:JSON.stringify({status:"completed"})});
    check("renewal is protected before Legal imports it",bypass.status===409);
    const childBind={...binding,event_id:randomUUID(),obligation_id:randomUUID(),parent_obligation_id:obligation,record_id:children[0].id,expected_fingerprint:createHash("sha256").update(JSON.stringify(["CI delegated PCI","2028-10-27","","yearly"])).digest("hex")};
    check("renewal accepts fresh inherited duty binding",(await apply(childBind)).status===200);
  }

  console.log("\nProtect diagnostic receiver and owner isolation:");
  const protectUrl = `${BASE}/api/integrations/protect`;
  const trafficUrl = `${BASE}/api/cameras/traffic`;
  const protectHeaders = { "Content-Type": "application/json", "X-Protect-Token": process.env.PROTECT_WEBHOOK_TOKEN };
  const protectAlarm = { alarm: { name: `CI entrance ${randomUUID()}`, triggers: [{ key: "line", device: "ci-camera" }] }, timestamp: Date.now() };
  const postAlarm = (body, headers = protectHeaders) => fetch(protectUrl, { method: "POST", headers, body: JSON.stringify(body) });
  check("receiver rejects missing token", (await postAlarm(protectAlarm, { "Content-Type": "application/json" })).status === 401);
  check("receiver rejects wrong token", (await postAlarm(protectAlarm, { ...protectHeaders, "X-Protect-Token": "wrong" })).status === 401);
  check("receiver rejects non-JSON", (await postAlarm(protectAlarm, { ...protectHeaders, "Content-Type": "text/plain" })).status === 415);
  check("receiver rejects malformed alarm", (await postAlarm({ timestamp: Date.now() })).status === 400);
  check("receiver rejects malformed JSON", (await fetch(protectUrl, { method: "POST", headers: protectHeaders, body: "{" })).status === 400);
  check("receiver rejects oversized body", (await postAlarm({ ...protectAlarm, padding: "x".repeat(33000) })).status === 413);
  check("GET cannot ingest events", (await fetch(protectUrl)).status === 405);
  const retries = await Promise.all([postAlarm(protectAlarm), postAlarm(protectAlarm)]);
  check("concurrent first deliveries are accepted", retries.every(r => r.status === 200));
  check("retry is accepted", (await postAlarm(protectAlarm)).status === 200);
  check("diagnostics reject anonymous access", (await fetch(trafficUrl)).status === 401);
  check("diagnostics reject staff access", (await fetch(trafficUrl, { headers: { cookie: staff.cookie } })).status === 403);
  check("ingestion token cannot read diagnostics", (await fetch(trafficUrl, { headers: protectHeaders })).status === 401);
  const trafficResponse = await fetch(trafficUrl, { headers: { cookie: right.cookie } });
  const traffic = await trafficResponse.json();
  check("owner sees one event after concurrent retries", trafficResponse.status === 200 && traffic.events?.filter(e => e.alarmName === protectAlarm.alarm.name).length === 1);
  check("diagnostics are not cached", trafficResponse.headers.get("cache-control") === "no-store");
  check("diagnostics do not return the secret", !JSON.stringify(traffic).includes(process.env.PROTECT_WEBHOOK_TOKEN));

  await wdfSmoke({ base: BASE, ownerHeaders, staffHeaders: { cookie: staff.cookie, "Content-Type": "application/json", Origin: BASE }, check });

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
