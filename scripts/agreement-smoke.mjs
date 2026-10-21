
import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { createHash } from "node:crypto";
export async function agreementSmoke({ base, ownerHeaders, staffHeaders, check }) {
  console.log("\nWritten linen agreements, PDFs and signed-copy preservation:");
  const post = async (body, headers = ownerHeaders) => {
    const r = await fetch(base + "/api/wdf", { method: "POST", headers, body: JSON.stringify(body) });
    return { status: r.status, ...await r.json() };
  };
  const customer = (await post({ action: "customer.create", name: "CI written agreement " + randomUUID() })).customer;
  const cid = customer.id;
  const planInput = { action: "linen.plan", customerId: cid, itemName: "Bar towels", towelsPerExchange: 100, bagsPerExchange: 2,
    weeklyFeeCents: 3846, exchangeDay: 1, towelGrams: 50, bagTareGrams: 100, active: true };
  const plan = (await post(planInput)).plan;
  const terms = {
    providerLegalName: "CI Laundry LLC", providerAddress: "100 Example Street, Clinton, NC", providerEmail: "provider@example.com",
    providerSigner: "CI Provider", providerTitle: "Owner", customerLegalName: "CI Restaurant LLC", customerAddress: "200 Example Street, Clinton, NC",
    customerEmail: "customer@example.com", customerSigner: "CI Customer", customerTitle: "Owner", serviceAddress: "200 Example Street, Clinton, NC",
    startDate: "2026-11-01", termType: "FIXED", endDate: "2027-10-31", renewal: "END", noticeDays: 14, earlyExit: "MUTUAL",
    paymentDays: 7, cureDays: 10, returnDays: 7, assignment: "SALE", towelReplacementCents: 82, bagReplacementCents: 500,
    specialTerms: "CI test document, not a real agreement.",
  };
  const directory = await (await fetch(base + "/api/wdf?agreements=1&customerId=" + cid, { headers: ownerHeaders })).json();
  const rep = directory.representatives.find(r => r.id === directory.currentUserId);
  if (!rep) throw new Error("Current owner missing from representatives.");
  terms.providerRepresentativeId = rep.id;
  const staffDirectory = await (await fetch(base + "/api/wdf?agreements=1&customerId=" + cid, { headers: staffHeaders })).json();
  check("staff agreement reads do not expose representative directory", staffDirectory.representatives.length === 0);
  const input = { action: "agreement.create", customerId: cid, requestKey: randomUUID(), terms };
  check("staff cannot draft contracts", (await post(input, staffHeaders)).status === 403);
  check("deleted or unknown representative is rejected", (await post({ ...input, requestKey: randomUUID(), terms: { ...terms, providerRepresentativeId: "missing-user" } })).status === 400);
  const a = (await post(input)).agreement;
  if (!a?.id) throw new Error("Agreement creation failed.");
  check("draft uses saved rental price", a.status === "DRAFT" && a.terms.weeklyFeeCents === 3846 && a.documentText.includes("$38.46"));
  check("provider and representative use trusted app data", a.terms.providerLegalName === "Clinton Laundry Works, LLC" &&
    a.terms.providerAddress === "540 McKoy St" && a.terms.providerRepresentativeId === rep.id && a.terms.providerSigner === rep.name && a.terms.providerEmail === rep.email &&
    a.terms.providerTitle === "Authorized Representative");
  const same = await post(input);
  check("draft retries preserve one version", same.agreement?.id === a.id);
  check("reused draft key cannot change terms", (await post({ ...input, terms: { ...terms, noticeDays: 30 } })).status === 409);
  const pdfUrl = base + "/api/wdf/agreements/" + a.id + "/pdf";
  check("agreement PDF rejects anonymous access", (await fetch(pdfUrl)).status === 401);
  const preview = await fetch(pdfUrl, { headers: staffHeaders });
  check("staff can view printable draft PDF", preview.status === 200 && preview.headers.get("content-type") === "application/pdf");
  check("agreement PDF is not cached", preview.headers.get("cache-control")?.includes("no-store"));
  check("signed copy absent before upload", (await fetch(pdfUrl + "?kind=signed", { headers: ownerHeaders })).status === 404);
  check("staff cannot issue a draft", (await post({ action: "agreement.issue", customerId: cid, agreementId: a.id, reviewed: true }, staffHeaders)).status === 403);
  check("issuing requires explicit review", (await post({ action: "agreement.issue", customerId: cid, agreementId: a.id })).status === 400);
  const issued = (await post({ action: "agreement.issue", customerId: cid, agreementId: a.id, reviewed: true })).agreement;
  check("owner issues frozen original", issued?.status === "ISSUED" && Boolean(issued.issuedPdfSha));
  const beforeBytes = Buffer.from(await (await fetch(pdfUrl, { headers: staffHeaders })).arrayBuffer());
  check("frozen PDF hash matches downloaded original", createHash("sha256").update(beforeBytes).digest("hex") === issued.issuedPdfSha);
  const changedPlan = (await post({ ...planInput, version: plan.version, weeklyFeeCents: 4000 })).plan;
  const afterBytes = Buffer.from(await (await fetch(pdfUrl, { headers: ownerHeaders })).arrayBuffer());
  check("rental price changes cannot rewrite issued PDF", beforeBytes.equals(afterBytes));

  const scan = await PDFDocument.create(); scan.addPage().drawText("CI signed-copy test fixture; not real signatures.");
  const scanBytes = await scan.save();
  const form = () => {
    const f = new FormData(); f.set("file", new Blob([scanBytes], { type: "application/pdf" }), "signed-test.pdf");
    f.set("providerSignedDate", "2026-10-20"); f.set("customerSignedDate", "2026-10-20"); f.set("attested", "true"); return f;
  };
  const uploadUrl = base + "/api/wdf/agreements/" + a.id + "/signed";
  const uploadHeaders = { cookie: ownerHeaders.cookie, Origin: ownerHeaders.Origin };
  check("staff cannot record signed copies", (await fetch(uploadUrl, { method: "POST", headers: { cookie: staffHeaders.cookie, Origin: staffHeaders.Origin }, body: form() })).status === 403);
  const bad = form(); bad.set("file", new Blob(["not PDF"], { type: "application/pdf" }), "fake.pdf");
  check("fake PDF rejected", (await fetch(uploadUrl, { method: "POST", headers: uploadHeaders, body: bad })).status === 400);
  const upload = await fetch(uploadUrl, { method: "POST", headers: uploadHeaders, body: form() });
  check("owner can retain reviewed signed copy", upload.status === 200);
  check("signed upload retries are idempotent", (await fetch(uploadUrl, { method: "POST", headers: uploadHeaders, body: form() })).status === 200);
  const read = async () => (await (await fetch(base + "/api/wdf?agreements=1&customerId=" + cid, { headers: ownerHeaders })).json());
  const signed = (await read()).agreements.find(x => x.id === a.id);
  check("record retains signature dates and file identity", signed?.status === "SIGNED" && signed.customerSignedDate === "2026-10-20" && Boolean(signed.signedFileSha));
  const signedRes = await fetch(pdfUrl + "?kind=signed&download=1", { headers: ownerHeaders });
  const signedBytes = Buffer.from(await signedRes.arrayBuffer());
  check("download preserves signed PDF bytes exactly", signedBytes.equals(Buffer.from(scanBytes)) && signedRes.headers.get("content-disposition")?.startsWith("attachment"));
  const replacementScan = await PDFDocument.create(); replacementScan.addPage().drawText("Different file.");
  const overwrite = form(); overwrite.set("file", new Blob([await replacementScan.save()], { type: "application/pdf" }), "different.pdf");
  check("signed copy cannot be overwritten", (await fetch(uploadUrl, { method: "POST", headers: uploadHeaders, body: overwrite })).status === 409);
  const replacement = (await post({ ...input, requestKey: randomUUID(), supersedesId: a.id, terms: { ...terms, termType: "WEEKLY", endDate: null } })).agreement;
  check("amendment creates new version with current price", replacement?.version === 2 && replacement.terms.weeklyFeeCents === 4000 && replacement.documentText.includes("replaces service agreement #" + a.number));
  check("new draft does not supersede signed contract prematurely", (await read()).agreements.find(x => x.id === a.id)?.status === "SIGNED");
  await post({ action: "agreement.issue", customerId: cid, agreementId: replacement.id, reviewed: true });
  const secondUpload = await fetch(base + "/api/wdf/agreements/" + replacement.id + "/signed", { method: "POST", headers: uploadHeaders, body: form() });
  check("replacement is recorded only after signatures uploaded", secondUpload.status === 200);
  const history = (await read()).agreements;
  check("old signed contract remains accessible after supersession", history.find(x => x.id === a.id)?.status === "SUPERSEDED" && history.find(x => x.id === replacement.id)?.status === "SIGNED");
  check("staff cannot retire contracts", (await post({ action: "agreement.void", customerId: cid, agreementId: replacement.id, reason: "test" }, staffHeaders)).status === 403);
  check("retirement requires a reason", (await post({ action: "agreement.void", customerId: cid, agreementId: replacement.id })).status === 400);
  await post({ action: "agreement.void", customerId: cid, agreementId: replacement.id, reason: "CI test completed" });
  const retained = (await read()).agreements.find(x => x.id === replacement.id);
  check("retired contract retains issued text and signed file identity", retained?.status === "VOIDED" && Boolean(retained.signedFileSha) && Boolean(retained.documentText));
}
