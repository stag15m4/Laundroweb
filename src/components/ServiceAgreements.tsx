
"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { money, displayDate } from "@/lib/wdf-types";
import { AgreementTerms, endAfterMonths } from "@/lib/service-agreement";

type Contract = { id: string; number: number; version: number; status: string; terms: AgreementTerms; documentText: string; documentSha: string; createdAt: string;
  issuedAt: string | null; signedAt: string | null; signedFileName: string | null; providerSignedDate: string | null; customerSignedDate: string | null; voidReason: string | null };
type Form = {
  providerLegalName: string; providerAddress: string; providerEmail: string; providerSigner: string; providerTitle: string;
  customerLegalName: string; customerAddress: string; customerEmail: string; customerSigner: string; customerTitle: string; serviceAddress: string;
  startDate: string; termType: string; endDate: string; renewal: string; noticeDays: string; earlyExit: string; paymentDays: string;
  cureDays: string; returnDays: string; assignment: string; specialTerms: string; towelReplacement: string; bagReplacement: string;
};
function today() {
  const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
const baseForm: Form = { providerLegalName: "", providerAddress: "", providerEmail: "", providerSigner: "", providerTitle: "",
  customerLegalName: "", customerAddress: "", customerEmail: "", customerSigner: "", customerTitle: "", serviceAddress: "",
  startDate: "", termType: "WEEKLY", endDate: "", renewal: "END", noticeDays: "14", earlyExit: "MUTUAL", paymentDays: "7",
  cureDays: "10", returnDays: "7", assignment: "SALE", specialTerms: "", towelReplacement: "0.00", bagReplacement: "0.00" };
const select = "w-full rounded-md border bg-white p-2 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1 text-sm font-medium text-gray-700"><span>{label}</span>{children}</label>; }
async function api(customerId: string, body?: unknown): Promise<any> {
  const r = await fetch("/api/wdf" + (body ? "" : "?agreements=1&customerId=" + encodeURIComponent(customerId)), body ?
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body as object, customerId }) } : { cache: "no-store" });
  const d = await r.json(); if (!r.ok) throw new Error(d.message || "Could not complete agreement request."); return d;
}
export function ServiceAgreements({ customerId }: { customerId: string }) {
  const [data, setData] = useState<any>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(""), [editing, setEditing] = useState(false), [form, setForm] = useState<Form>(baseForm);
  const [months, setMonths] = useState("12"), [supersedes, setSupersedes] = useState(""), [reviewed, setReviewed] = useState(false);
  const [uploading, setUploading] = useState(false), [file, setFile] = useState<File | null>(null), [attested, setAttested] = useState(false);
  const [providerDate, setProviderDate] = useState(""), [customerDate, setCustomerDate] = useState("");
  const lock = useRef(false), nonce = useRef("");
  const contracts: Contract[] = data?.agreements ?? [];
  const chosen = contracts.find(a => a.id === selected);
  const signed = contracts.find(a => a.status === "SIGNED");
  async function reload() { const d = await api(customerId); setData(d); return d; }
  useEffect(() => {
    let cancelled = false; nonce.current = crypto.randomUUID();
    api(customerId).then(d => { if (!cancelled) { setData(d); setSelected(d.agreements[0]?.id ?? ""); } }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [customerId]);
  async function save(body: unknown, done?: (d: any) => void) {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { const d = await api(customerId, body); nonce.current = crypto.randomUUID(); done?.(d); await reload(); }
    catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  function change<K extends keyof Form>(key: K, value: Form[K]) { nonce.current = crypto.randomUUID(); setForm(f => ({ ...f, [key]: value })); }
  function newDraft() {
    const t = chosen?.terms;
    setForm(t ? { ...baseForm, ...t, endDate: t.endDate ?? "", noticeDays: String(t.noticeDays), paymentDays: String(t.paymentDays),
      cureDays: String(t.cureDays), returnDays: String(t.returnDays), specialTerms: t.specialTerms ?? "",
      towelReplacement: (t.towelReplacementCents / 100).toFixed(2), bagReplacement: (t.bagReplacementCents / 100).toFixed(2) } :
      { ...baseForm, ...data.providerDefaults, customerLegalName: data.customer?.company || data.customer?.name || "", customerEmail: data.customer?.email || "", startDate: today() });
    setSupersedes(signed?.id ?? ""); setEditing(true); nonce.current = crypto.randomUUID(); setReviewed(false); setError("");
  }
  async function upload(e: React.FormEvent) {
    e.preventDefault(); if (!chosen || !file || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const body = new FormData(); body.set("file", file); body.set("providerSignedDate", providerDate); body.set("customerSignedDate", customerDate); body.set("attested", String(attested));
      const r = await fetch("/api/wdf/agreements/" + chosen.id + "/signed", { method: "POST", body });
      const d = await r.json(); if (!r.ok) throw new Error(d.message || "Could not store signed copy.");
      setUploading(false); setFile(null); setAttested(false); await reload();
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  const input = (key: keyof Form, label: string, type = "text") => <Field label={label}><Input required type={type} value={form[key]} onChange={e => change(key, e.target.value)} /></Field>;
  const numeric = (key: keyof Form, label: string, min: number, max: number) => <Field label={label}><Input required type="number" min={min} max={max} step="1" value={form[key]} onChange={e => change(key, e.target.value)} /></Field>;
  return <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 space-y-4">
    <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold text-lg">Written service agreements</h3><p className="text-sm text-gray-500">Generate, print, sign and retain the contract for this rental account.</p></div>
      {data?.isOwner && data?.plan && <Button variant="outline" disabled={busy} onClick={newDraft}>Create new contract version</Button>}</div>
    {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
    {!data ? <p className="text-sm">Loading agreements…</p> : !data.plan ? <p className="text-sm text-gray-500">Set up the rental account first.</p> : <>
      <p className="text-xs text-gray-500">Business template for review. Have a North Carolina attorney approve the base terms before customer use. Signed contracts document the relationship; they do not guarantee a sale value.</p>
      {!contracts.length && !editing && <p className="text-sm text-gray-500">No written contract recorded.</p>}
      {contracts.length > 0 && <select aria-label="Agreement version" className={select} value={selected} onChange={e => { setSelected(e.target.value); setReviewed(false); setUploading(false); }}>
        {contracts.map(a => <option key={a.id} value={a.id}>Agreement #{a.number} · v{a.version} · {a.status}</option>)}
      </select>}
      {chosen && !editing && <div className="space-y-3">
        <div className="grid sm:grid-cols-3 gap-3 text-sm"><p><strong>{chosen.status}</strong><br />Created {displayDate(chosen.createdAt)}</p><p>{chosen.terms.termType === "FIXED" ? "Fixed term: " + chosen.terms.startDate + " through " + chosen.terms.endDate : "Week-to-week from " + chosen.terms.startDate}<br />Renewal: {chosen.terms.renewal === "WEEKLY" ? "Week-to-week" : "Ends at expiry"}</p><p>{money(chosen.terms.weeklyFeeCents)}/week<br />Assignment: {chosen.terms.assignment === "SALE" ? "Permitted with business sale under terms" : "Consent required"}</p></div>
        {chosen.status === "SIGNED" && chosen.terms.weeklyFeeCents !== data.plan.weeklyFeeCents && <p className="text-sm text-amber-800 bg-amber-50 p-3">Billing settings differ from this signed contract. Review the agreement and rental price before invoicing. Contract records do not automatically change billing.</p>}
        {chosen.status === "SIGNED" && chosen.terms.termType === "FIXED" && chosen.terms.endDate! < today() && <p className="text-sm text-amber-800">The initial term has ended. Review the renewal provision before continuing service or billing.</p>}
        {chosen.voidReason && <p className="text-sm">Record retired: {chosen.voidReason}</p>}
        <div className="flex flex-wrap gap-3 text-sm">
          <a className="text-blue-700 underline" target="_blank" rel="noopener noreferrer" href={"/api/wdf/agreements/" + chosen.id + "/pdf"}>{chosen.issuedAt ? "View / print issued original" : "View / print draft PDF"}</a>
          <a className="text-blue-700 underline" href={"/api/wdf/agreements/" + chosen.id + "/pdf?download=1"}>Download PDF</a>
          {chosen.signedFileName && <a className="text-blue-700 underline" target="_blank" rel="noopener noreferrer" href={"/api/wdf/agreements/" + chosen.id + "/pdf?kind=signed"}>View / print signed copy</a>}
        </div>
        <details><summary className="text-sm cursor-pointer">Review complete contract text</summary><pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed">{chosen.documentText}</pre></details>
        {data.isOwner && chosen.status === "DRAFT" && <div className="space-y-3 border-t pt-3"><label className="flex gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I reviewed the legal names, service details, price and complete terms.</label><Button disabled={busy || !reviewed} onClick={() => save({ action: "agreement.issue", agreementId: chosen.id, reviewed: true })}>Issue for signature</Button><p className="text-xs text-gray-500">Issuing freezes the original PDF. For changes, create a new version.</p></div>}
        {data.isOwner && chosen.status === "ISSUED" && <><Button disabled={busy} variant="outline" onClick={() => setUploading(v => !v)}>Record signed PDF</Button>
          {uploading && <form onSubmit={upload} className="space-y-3 border rounded p-3">
            <Field label="Complete signed PDF (up to 10 MB)"><Input required type="file" accept="application/pdf,.pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} /></Field>
            <div className="grid sm:grid-cols-2 gap-3"><Field label="Provider signed on"><Input required type="date" max={today()} value={providerDate} onChange={e => setProviderDate(e.target.value)} /></Field><Field label="Customer signed on"><Input required type="date" max={today()} value={customerDate} onChange={e => setCustomerDate(e.target.value)} /></Field></div>
            <label className="flex gap-2 text-sm"><input required type="checkbox" checked={attested} onChange={e => setAttested(e.target.checked)} />I verified both authorized signatures are present and the signed copy matches the issued terms.</label>
            <p className="text-xs text-gray-500">This stores your reviewed scan; it does not electronically verify signatures. A signed file cannot be replaced.</p><Button disabled={busy || !attested}>Save signed contract</Button>
          </form>}
        </>}
        {data.isOwner && !["VOIDED", "SUPERSEDED"].includes(chosen.status) && <button disabled={busy} className="text-xs text-red-700 underline" onClick={() => {
          const reason = window.prompt("Why retire this record? This does not itself terminate or release either party from a signed legal agreement.");
          if (reason?.trim()) save({ action: "agreement.void", agreementId: chosen.id, reason });
        }}>Retire this record (history retained)</button>}
      </div>}
      {editing && data.isOwner && <form className="space-y-4 border-t pt-4" onSubmit={e => {
        e.preventDefault(); save({ action: "agreement.create", requestKey: nonce.current, supersedesId: supersedes || null,
          terms: { ...form, endDate: form.termType === "FIXED" ? form.endDate : null, noticeDays: Number(form.noticeDays), paymentDays: Number(form.paymentDays),
            cureDays: Number(form.cureDays), returnDays: Number(form.returnDays), towelReplacementCents: Math.round(Number(form.towelReplacement) * 100),
            bagReplacementCents: Math.round(Number(form.bagReplacement) * 100) },
        }, d => { setSelected(d.agreement.id); setEditing(false); });
      }}>
        <h4 className="font-semibold">Parties and signatures</h4>
        <p className="text-xs text-gray-500">Use the actual business legal entities, not just trade names. No personal guaranty is included.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {input("providerLegalName", "Provider legal entity")}{input("customerLegalName", "Customer legal entity")}
          {input("providerAddress", "Provider mailing address")}{input("customerAddress", "Customer mailing address")}
          {input("providerEmail", "Provider notice email", "email")}{input("customerEmail", "Customer notice email", "email")}
          {input("providerSigner", "Provider signer name")}{input("customerSigner", "Customer signer name")}
          {input("providerTitle", "Provider signer title")}{input("customerTitle", "Customer signer title")}
        </div>
        {input("serviceAddress", "Service / delivery address")}
        <h4 className="font-semibold">Term, renewal and cancellation</h4>
        <div className="grid sm:grid-cols-2 gap-3">{input("startDate", "Service start date", "date")}
          <Field label="Contract term"><select className={select} value={form.termType} onChange={e => { change("termType", e.target.value); if (e.target.value === "FIXED" && form.startDate) change("endDate", endAfterMonths(form.startDate, Number(months))); }}><option value="WEEKLY">Week-to-week</option><option value="FIXED">Fixed term</option></select></Field></div>
        {form.termType === "FIXED" && <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-end"><Field label="Calculate suggested end date"><select className={select} value={months} onChange={e => setMonths(e.target.value)}>{[1, 3, 6, 12, 24, 36].map(n => <option key={n} value={n}>{n} months</option>)}</select></Field><Button type="button" variant="outline" disabled={!form.startDate} onClick={() => { try { change("endDate", endAfterMonths(form.startDate, Number(months))); } catch { setError("Choose a valid start date."); } }}>Apply length</Button></div>
          <div className="grid sm:grid-cols-2 gap-3">{input("endDate", "Fixed term ends (inclusive)", "date")}
            <Field label="At end of initial term"><select className={select} value={form.renewal} onChange={e => change("renewal", e.target.value)}><option value="END">End service unless renewed in writing</option><option value="WEEKLY">Continue week-to-week</option></select></Field>
            <Field label="Early exit during fixed term"><select className={select} value={form.earlyExit} onChange={e => change("earlyExit", e.target.value)}><option value="MUTUAL">Mutual written agreement or uncured breach</option><option value="NOTICE">Either party may leave with written notice</option></select></Field>
          </div><p className="text-xs text-gray-500">A fixed term with a convenience exit is less firm than a fixed term requiring mutual agreement. No automatic early-exit penalty is added.</p>
        </div>}
        <div className="grid sm:grid-cols-2 gap-3">{numeric("noticeDays", "Notice days for weekly service / permitted exit", 1, 180)}{numeric("paymentDays", "Invoice due days (0 = on receipt)", 0, 90)}{numeric("cureDays", "Days to cure material breach after notice", 1, 90)}{numeric("returnDays", "Days to make stock available at end", 1, 60)}</div>
        <h4 className="font-semibold">Service and commercial terms</h4>
        <p className="text-sm">{data.plan.towelsPerExchange} {data.plan.itemName} and {data.plan.bagsPerExchange} bags per weekly exchange · {data.plan.weeklyFeeCents ? money(data.plan.weeklyFeeCents) : "Price not set"}/week. These values will be copied from the rental account when generating the draft.</p>
        <div className="grid sm:grid-cols-2 gap-3"><Field label="Confirmed lost/damaged towel ($ each)"><Input required type="number" min="0" max="1000" step="0.01" value={form.towelReplacement} onChange={e => change("towelReplacement", e.target.value)} /></Field><Field label="Confirmed lost/damaged bag ($ each)"><Input required type="number" min="0" max="1000" step="0.01" value={form.bagReplacement} onChange={e => change("bagReplacement", e.target.value)} /></Field></div>
        <Field label="Assignment on sale of CLW"><select className={select} value={form.assignment} onChange={e => change("assignment", e.target.value)}><option value="SALE">Customer consents to business-sale assignment with successor assumption and notice</option><option value="CONSENT">Require separate written consent for all assignments</option></select></Field>
        <Field label="Signed agreement this replaces (if applicable)"><select className={select} value={supersedes} onChange={e => { nonce.current = crypto.randomUUID(); setSupersedes(e.target.value); }}><option value="">New relationship / no prior signed agreement</option>{contracts.filter(a => a.status === "SIGNED").map(a => <option key={a.id} value={a.id}>Agreement #{a.number} v{a.version}</option>)}</select></Field>
        <Field label="Special negotiated terms / attorney-approved additions"><Textarea rows={5} maxLength={6000} value={form.specialTerms} onChange={e => change("specialTerms", e.target.value)} /></Field>
        <div className="flex gap-2"><Button disabled={busy || !data.plan.weeklyFeeCents}>Generate draft PDF</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button></div>
      </form>}
    </>}
  </section>;
}
