
"use client";
import { useEffect, useRef, useState } from "react";
import { ServiceAgreements } from "@/components/ServiceAgreements";
import { ServiceAddresses } from "@/components/ServiceAddresses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { money, displayDate } from "@/lib/wdf-types";
import { estimateTowels } from "@/lib/linen";
import { ServiceLocation } from "@/lib/wdf-location";

type Exchange = {
  id: string; kind: string; towelsOut: number; towelsIn: number; towelsLost: number;
  bagsOut: number; bagsIn: number; bagsLost: number; towelAdjustment: number; bagAdjustment: number;
  countMethod: string; grossGrams: number | null; tareGrams: number | null; towelGrams: number | null;
  actorName: string; occurredAt: string; reason: string | null; notes: string | null;
};
type Plan = {
  id: string; customerId: string; itemName: string; towelsPerExchange: number; bagsPerExchange: number;
  weeklyFeeCents: number | null; exchangeDay: number | null; towelGrams: number | null; bagTareGrams: number;
  notes: string | null; active: boolean; version: number; exchanges: Exchange[];
  charges: { weekStart: string; order: { id: string; number: number; status: string; totalCents: number } }[];
};
type Data = { customer: { id: string; name: string; active: boolean; deliveryLocation: ServiceLocation | null; version: number }; plan: Plan | null; balance: { towels: number; bags: number }; isOwner: boolean };
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const box = "rounded-xl border border-gray-200 bg-white p-4 sm:p-6";
const select = "w-full rounded-md border border-gray-300 bg-white p-2 text-sm";
const empty = { itemName: "Bar towels", towels: "100", bags: "1", fee: "", day: "", grams: "", tare: "0", notes: "", active: true };
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-gray-700 space-y-1"><span>{label}</span>{children}</label>;
}
function monday() {
  const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
async function request(customerId: string, body?: unknown): Promise<any> {
  const r = await fetch("/api/wdf" + (body ? "" : "?linen=1&customerId=" + encodeURIComponent(customerId)), body ?
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await r.json(); if (!r.ok) throw new Error(data.message || "Could not load rental account."); return data;
}

export function LinenAccount({ customerId, onOrder, hideAddresses = false, addressVersion }: { customerId: string; onOrder?: (id: string) => void; hideAddresses?: boolean; addressVersion?: number }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [agreement, setAgreement] = useState(empty);
  const [exchange, setExchange] = useState({ towelsOut: "100", towelsIn: "0", bagsOut: "1", bagsIn: "0", towelsLost: "0", bagsLost: "0", countMethod: "COUNTED", grossGrams: "", notes: "", reason: "" });
  const [week, setWeek] = useState(monday);
  const [reconciling, setReconciling] = useState(false);
  const [reconcile, setReconcile] = useState({ towels: "0", bags: "0", reason: "" });
  const lock = useRef(false), requestKey = useRef(""), generation = useRef(0);
  function setCurrent(d: Data) {
    setData(d);
    const p = d.plan;
    setAgreement(p ? { itemName: p.itemName, towels: String(p.towelsPerExchange), bags: String(p.bagsPerExchange),
      fee: p.weeklyFeeCents === null ? "" : (p.weeklyFeeCents / 100).toFixed(2), day: p.exchangeDay === null ? "" : String(p.exchangeDay),
      grams: p.towelGrams === null ? "" : String(p.towelGrams), tare: String(p.bagTareGrams), notes: p.notes ?? "", active: p.active } : empty);
  }
  async function reload() { const d = await request(customerId); setCurrent(d); return d as Data; }
  useEffect(() => {
    const current = ++generation.current; setData(null); setError(""); setEditing(false); setReconciling(false);
    requestKey.current = crypto.randomUUID();
    request(customerId).then(d => {
      if (current !== generation.current) return; setCurrent(d);
      setExchange({ towelsOut: d.plan?.active && d.customer.active ? String(d.plan.towelsPerExchange) : "0", towelsIn: "0",
        bagsOut: d.plan?.active && d.customer.active ? String(d.plan.bagsPerExchange) : "0", bagsIn: "0",
        towelsLost: "0", bagsLost: "0", countMethod: "COUNTED", grossGrams: "", notes: "", reason: "" });
    }).catch(e => { if (current === generation.current) setError(e.message); });
    return () => { generation.current++; };
  }, [customerId, addressVersion]);
  async function save(body: Record<string, unknown>, done?: (result: any) => void) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await request(customerId, { ...body, customerId });
      setNotice("Saved.");
      requestKey.current = crypto.randomUUID();
      done?.(result);
      try { await reload(); } catch { setError("Saved, but could not refresh. Reload before recording another exchange."); }
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  function change(values: Partial<typeof exchange>) { requestKey.current = crypto.randomUUID(); setExchange(p => ({ ...p, ...values })); }
  const p = data?.plan;
  let estimated: number | null = null;
  if (p?.towelGrams && exchange.countMethod === "WEIGHT_ESTIMATE") {
    try { estimated = estimateTowels(Number(exchange.grossGrams), p.bagTareGrams * Number(exchange.bagsOut), p.towelGrams); } catch { /* incomplete */ }
  }
  function viewOrder(id: string) { if (onOrder) onOrder(id); else window.location.href = "/dashboard/wdf?orderId=" + encodeURIComponent(id); }
  if (!data) return <div className={box}>{error ? <p role="alert" className="text-red-700">{error}</p> : "Loading linen rental…"}</div>;
  return <section className="space-y-4">
    {!hideAddresses && <ServiceAddresses key={customerId} customerId={customerId} onSaved={() => { reload().catch(e => setError(e.message)); }} />}
    <div className={box}>
      <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold text-lg">Linen rental · {data.customer.name}</h3>
        <p className="text-sm text-gray-500">Reusable towels and bags assigned to this customer.</p></div>
        {data.isOwner && <Button variant="outline" disabled={busy} onClick={() => setEditing(v => !v)}>{p ? "Edit agreement" : "Set up rental account"}</Button>}</div>
      {error && <div role="alert" className="mt-3 text-red-700 text-sm">{error} <button className="underline" onClick={() => reload().catch(e => setError(e.message))}>Reload account</button></div>}
      {notice && <p role="status" className="mt-3 text-sm text-green-700">{notice}</p>}
      {!p && !editing && <p className="mt-4 text-sm text-gray-500">No rental program yet. An owner can set the quantities, weekly price and bag tare weight.</p>}
      {p && <><div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
        <div><p className="text-xs text-gray-500">Towels at customer</p><p className="text-2xl font-semibold">{data.balance.towels}</p></div>
        <div><p className="text-xs text-gray-500">Bags at customer</p><p className="text-2xl font-semibold">{data.balance.bags}</p></div>
        <div><p className="text-xs text-gray-500">Agreed weekly price</p><p className="text-xl font-semibold">{p.weeklyFeeCents === null ? "Not set" : money(p.weeklyFeeCents)}</p></div>
        <div><p className="text-xs text-gray-500">Exchange</p><p>{p.towelsPerExchange} {p.itemName}</p><p className="text-sm">{p.exchangeDay === null ? "Day not set" : days[p.exchangeDay]} · {p.active && data.customer.active ? "Active" : "Paused"}</p></div>
      </div><p className="mt-4 text-xs text-gray-500">Balances include all deliveries, returns and owner corrections. Weight-estimated deliveries remain estimates; a difference does not automatically create a loss charge.</p>
        {p.notes && <p className="mt-3 text-sm whitespace-pre-wrap">{p.notes}</p>}</>}
      {editing && data.isOwner && <form className="mt-5 space-y-3 border-t pt-4" onSubmit={e => {
        e.preventDefault(); save({ action: "linen.plan", version: p?.version, itemName: agreement.itemName,
          towelsPerExchange: Number(agreement.towels), bagsPerExchange: Number(agreement.bags),
          weeklyFeeCents: agreement.fee === "" ? null : Math.round(Number(agreement.fee) * 100), exchangeDay: agreement.day === "" ? null : Number(agreement.day),
          towelGrams: agreement.grams === "" ? null : Number(agreement.grams), bagTareGrams: Number(agreement.tare), notes: agreement.notes, active: agreement.active,
        }, () => setEditing(false));
      }}>
        <Field label="Towel type"><Input required maxLength={200} value={agreement.itemName} onChange={e => setAgreement(a => ({ ...a, itemName: e.target.value }))} /></Field>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Towels per exchange"><Input required type="number" min="1" step="1" max="100000" value={agreement.towels} onChange={e => setAgreement(a => ({ ...a, towels: e.target.value }))} /></Field>
          <Field label="Bags per exchange"><Input required type="number" min="0" step="1" max="1000" value={agreement.bags} onChange={e => setAgreement(a => ({ ...a, bags: e.target.value }))} /></Field>
          <Field label="Agreed weekly price ($)"><Input type="number" min="0.01" step="0.01" value={agreement.fee} onChange={e => setAgreement(a => ({ ...a, fee: e.target.value }))} /></Field>
        </div>
        <p className="text-xs text-gray-500">Leave price blank until agreed. $2,000 ÷ 52 is about $38.46/week; billing $38.46 for 52 weeks totals $1,999.92. No customer is assigned a price automatically.</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Exchange day"><select className={select} value={agreement.day} onChange={e => setAgreement(a => ({ ...a, day: e.target.value }))}><option value="">Not set</option>{days.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field>
          <Field label="One clean dry towel (grams)"><Input type="number" min="1" max="10000" step="1" value={agreement.grams} onChange={e => setAgreement(a => ({ ...a, grams: e.target.value }))} /></Field>
          <Field label="One empty bag (grams)"><Input required type="number" min="0" max="100000" step="1" value={agreement.tare} onChange={e => setAgreement(a => ({ ...a, tare: e.target.value }))} /></Field>
        </div>
        <p className="text-xs text-gray-500">Calibrate using a counted batch of clean, dry towels. Enter its average towel weight rounded to a gram. Only clean deliveries can use this estimate; dirty/wet returns must be counted.</p>
        <Field label="Agreement / collection instructions"><Textarea value={agreement.notes} onChange={e => setAgreement(a => ({ ...a, notes: e.target.value }))} /></Field>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={agreement.active} onChange={e => setAgreement(a => ({ ...a, active: e.target.checked }))} />Active rental agreement</label>
        <Button disabled={busy}>Save rental agreement</Button>
      </form>}
    </div>

    {p && <><ServiceAgreements key={customerId + ":" + data.customer.version} customerId={customerId} /><div className="grid lg:grid-cols-2 gap-4">
      <form className={box + " space-y-4"} onSubmit={e => {
        e.preventDefault(); save({ action: "linen.exchange", requestKey: requestKey.current, version: p.version,
          towelsOut: Number(exchange.towelsOut), towelsIn: Number(exchange.towelsIn), bagsOut: Number(exchange.bagsOut), bagsIn: Number(exchange.bagsIn),
          towelsLost: Number(exchange.towelsLost), bagsLost: Number(exchange.bagsLost), countMethod: exchange.countMethod,
          grossGrams: Number(exchange.grossGrams), notes: exchange.notes, reason: exchange.reason,
        }, () => setExchange({ towelsOut: "0", towelsIn: "0", bagsOut: "0", bagsIn: "0", towelsLost: "0", bagsLost: "0", countMethod: "COUNTED", grossGrams: "", notes: "", reason: "" }));
      }}>
        <h4 className="font-semibold">Record delivery / collection</h4>
        <Field label="Clean towel count method"><select className={select} value={exchange.countMethod} onChange={e => change({ countMethod: e.target.value })}><option value="COUNTED">Counted towels</option><option value="WEIGHT_ESTIMATE" disabled={!p.towelGrams}>Estimate clean dry towels by weight</option></select></Field>
        {exchange.countMethod === "WEIGHT_ESTIMATE" ? <><Field label="Gross weight: all clean towels and delivered bags (grams)"><Input required type="number" min="1" step="1" max="1000000" value={exchange.grossGrams} onChange={e => change({ grossGrams: e.target.value })} /></Field>
          <p className="text-sm">Estimated delivery: {estimated ?? "—"} towels. Subtracting {p.bagTareGrams * Number(exchange.bagsOut)}g bag tare.</p></> :
          <Field label="Clean towels delivered"><Input required type="number" min="0" step="1" max="100000" value={exchange.towelsOut} onChange={e => change({ towelsOut: e.target.value })} /></Field>}
        <Field label="Soiled towels returned (counted)"><Input required type="number" min="0" step="1" max="100000" value={exchange.towelsIn} onChange={e => change({ towelsIn: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Clean bags delivered"><Input required type="number" min="0" step="1" max="1000" value={exchange.bagsOut} onChange={e => change({ bagsOut: e.target.value })} /></Field><Field label="Bags returned"><Input required type="number" min="0" step="1" max="1000" value={exchange.bagsIn} onChange={e => change({ bagsIn: e.target.value })} /></Field></div>
        {data.isOwner && <details><summary className="text-sm cursor-pointer">Write off missing / unusable stock</summary><div className="space-y-3 mt-3">
          <div className="grid grid-cols-2 gap-3"><Field label="Towels written off"><Input required type="number" min="0" step="1" value={exchange.towelsLost} onChange={e => change({ towelsLost: e.target.value })} /></Field><Field label="Bags written off"><Input required type="number" min="0" step="1" value={exchange.bagsLost} onChange={e => change({ bagsLost: e.target.value })} /></Field></div>
          <Field label="Write-off reason"><Input required={Number(exchange.towelsLost) > 0 || Number(exchange.bagsLost) > 0} value={exchange.reason} onChange={e => change({ reason: e.target.value })} /></Field>
        </div></details>}
        <Field label="Exchange notes"><Textarea value={exchange.notes} onChange={e => change({ notes: e.target.value })} /></Field>
        <Button disabled={busy || (exchange.countMethod === "WEIGHT_ESTIMATE" && estimated === null)}>Record exchange</Button>
        <p className="text-xs text-gray-500">Records stock movement only. It does not create an invoice or charge a customer.</p>
      </form>
      <div className={box + " space-y-4"}>
        <h4 className="font-semibold">Weekly rental invoice</h4>
        {!data.customer.deliveryLocation && <p className="text-sm text-amber-800">Confirm the primary linen location above before creating a new invoice. Previously billed weeks can still be opened.</p>}
        <p className="text-sm">Uses the owner's agreed flat weekly price. Cash, check and card payments are recorded through the existing WDF invoice.</p>
        <form className="space-y-3" onSubmit={e => {
          e.preventDefault(); save({ action: "linen.bill", version: p.version, weekStart: week }, r => viewOrder(r.orderId));
        }}>
          <Field label="Service week starts (Monday)"><Input required type="date" value={week} onChange={e => setWeek(e.target.value)} /></Field>
          <Button disabled={busy || !p.active || !data.customer.active || p.weeklyFeeCents === null}>Create / open weekly invoice</Button>
        </form>
        <p className="text-xs text-gray-500">One invoice per account per service week. No automatic recurring billing, loss charges or bank transactions.</p>
        <div className="space-y-2">{p.charges.map(c => <button key={c.weekStart} className="block text-sm text-blue-700 underline" onClick={() => viewOrder(c.order.id)}>Week of {c.weekStart} · #{c.order.number} · {money(c.order.totalCents)} · {c.order.status.replaceAll("_", " ")}</button>)}</div>
        {data.isOwner && <div className="border-t pt-4">
          <Button variant="outline" disabled={busy} onClick={() => { setReconcile({ towels: String(data.balance.towels), bags: String(data.balance.bags), reason: "" }); setReconciling(v => !v); }}>Opening stock / correct balance</Button>
          {reconciling && <form className="space-y-3 mt-3" onSubmit={e => {
            e.preventDefault(); save({ action: "linen.reconcile", requestKey: requestKey.current, version: p.version,
              towels: Number(reconcile.towels), bags: Number(reconcile.bags), reason: reconcile.reason,
            }, () => setReconciling(false));
          }}>
            <p className="text-xs text-gray-500">Enter actual stock currently held by the customer. This records a correction; the earlier ledger remains intact.</p>
            <Field label="Actual towels at customer"><Input required type="number" min="0" step="1" value={reconcile.towels} onChange={e => { requestKey.current = crypto.randomUUID(); setReconcile(r => ({ ...r, towels: e.target.value })); }} /></Field>
            <Field label="Actual bags at customer"><Input required type="number" min="0" step="1" value={reconcile.bags} onChange={e => { requestKey.current = crypto.randomUUID(); setReconcile(r => ({ ...r, bags: e.target.value })); }} /></Field>
            <Field label="Reason"><Input required value={reconcile.reason} onChange={e => { requestKey.current = crypto.randomUUID(); setReconcile(r => ({ ...r, reason: e.target.value })); }} /></Field>
            <Button disabled={busy}>Record inventory correction</Button>
          </form>}
        </div>}
      </div>
    </div>
    <div className={box}><h4 className="font-semibold mb-4">Exchange history · latest 100</h4>
      {!p.exchanges.length && <p className="text-sm text-gray-500">No deliveries or returns recorded.</p>}
      <div className="space-y-3">{p.exchanges.map(x => <div key={x.id} className="border-t pt-3 text-sm">
        <p className="font-medium">{displayDate(x.occurredAt)} · {x.actorName} · {x.kind === "RECONCILE" ? "Inventory correction" : "Delivery / collection"}</p>
        {x.kind === "RECONCILE" ? <p>Adjustment: {x.towelAdjustment >= 0 ? "+" : ""}{x.towelAdjustment} towels; {x.bagAdjustment >= 0 ? "+" : ""}{x.bagAdjustment} bags.</p> :
          <><p>Towels: {x.towelsOut} delivered{x.countMethod === "WEIGHT_ESTIMATE" ? " (estimated)" : ""}, {x.towelsIn} returned, {x.towelsLost} written off.</p><p>Bags: {x.bagsOut} delivered, {x.bagsIn} returned, {x.bagsLost} written off.</p></>}
        {x.countMethod === "WEIGHT_ESTIMATE" && <p className="text-xs text-gray-500">Gross {x.grossGrams}g − tare {x.tareGrams}g; {x.towelGrams}g per towel at this exchange.</p>}
        {x.reason && <p>Reason: {x.reason}</p>}{x.notes && <p className="whitespace-pre-wrap">{x.notes}</p>}
      </div>)}</div>
    </div></>}
  </section>;
}
