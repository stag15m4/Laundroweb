
"use client";

import { useEffect, useRef, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Printer, Users, ShoppingBag, Search, ArrowLeft } from "lucide-react";
import { Customer, Order, Summary, money, statusLabel, displayDate } from "@/lib/wdf-types";
import { STATUSES, DEFAULT_RATE_CENTS, DEFAULT_MINIMUM_CENTS, quote } from "@/lib/wdf-pricing";

const selectClass = "h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm";
const panel = "rounded-xl border border-gray-200 bg-white p-4 sm:p-6";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5 text-sm font-medium text-gray-700"><span>{label}</span>{children}</label>;
}
function localDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function iso(value: string) { return value ? new Date(value).toISOString() : null; }
function cents(value: string) { return Math.round(Number(value) * 100); }
const emptyCustomer = { name: "", company: "", phone: "", email: "", preferences: "", notes: "", customRate: "", customMinimum: "", pricingExpiresAt: "", pricingReason: "", active: true };
type LineInput = { description: string; quantity: string; price: string };
type CustomerDetail = { customer: Customer; orders: Order[]; totals: { orders: number; totalCents: number; pounds: number; averageRateCents: number | null; laborMinutes: number; paidCents: number } };

async function api(query = "", body?: unknown) {
  const res = await fetch("/api/wdf" + query, body ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  } : { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Could not complete the request.");
  return data;
}

export default function WdfPage() {
  const [tab, setTab] = useState<"orders" | "customers">("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [owner, setOwner] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Order | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [customerForm, setCustomerForm] = useState(emptyCustomer);
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderCustomer, setOrderCustomer] = useState("");
  const [weight, setWeight] = useState("");
  const [due, setDue] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [override, setOverride] = useState(false);
  const [rate, setRate] = useState("2.00");
  const [minimum, setMinimum] = useState("25.00");
  const [overrideReason, setOverrideReason] = useState("");
  const [lines, setLines] = useState<LineInput[]>([]);
  const [work, setWork] = useState({ status: "", due: "", notes: "", machineNotes: "", laborMinutes: "0", reason: "" });
  const [payment, setPayment] = useState({ method: "CASH", kind: "PAYMENT", amount: "", reference: "", reason: "", confirmed: false, tendered: "" });
  const orderKey = useRef("");
  const paymentKey = useRef("");
  const saving = useRef(false);
  const reads = useRef(0);

  async function load(q = search) {
    const sequence = ++reads.current;
    const data = await api(q ? "?q=" + encodeURIComponent(q) : "");
    if (sequence !== reads.current) return;
    setOrders(data.orders); setCustomers(data.customers); setSummary(data.summary); setOwner(data.isOwner); setLoading(false);
  }
  useEffect(() => {
    const timer = setTimeout(() => { load(search).catch(e => { setError(e.message); setLoading(false); }); }, 250);
    return () => clearTimeout(timer);
    // load is intentionally driven by the search value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function chooseOrder(order: Order) {
    setSelected(order); setDetail(null);
    setWork({ status: order.status, due: localDate(order.dueAt), notes: order.notes ?? "", machineNotes: order.machineNotes ?? "", laborMinutes: String(order.laborMinutes), reason: "" });
    setPayment({ method: "CASH", kind: "PAYMENT", amount: (Math.max(0, order.balanceCents) / 100).toFixed(2), reference: "", reason: "", confirmed: false, tendered: "" });
    paymentKey.current = crypto.randomUUID();
  }
  async function openOrder(id: string) {
    setError("");
    try { const data = await api("?orderId=" + encodeURIComponent(id)); chooseOrder(data.order); }
    catch (e) { setError((e as Error).message); }
  }
  async function openCustomer(id: string) {
    setError("");
    try { setDetail(await api("?customerId=" + encodeURIComponent(id))); setSelected(null); setTab("customers"); }
    catch (e) { setError((e as Error).message); }
  }
  async function mutate(body: unknown, after?: (data: any) => void) {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const data = await api("", body);
      after?.(data);
      setNotice("Saved.");
      try { await load(); } catch { setError("Saved successfully, but the list could not refresh. Reload to see current records."); }
      return data;
    } catch (e) { setError((e as Error).message); }
    finally { saving.current = false; setBusy(false); }
  }
  function customerEditor(customer?: Customer) {
    setError(""); setEditing(customer ?? null);
    setCustomerForm(customer ? {
      name: customer.name, company: customer.company ?? "", phone: customer.phone ?? "", email: customer.email ?? "",
      preferences: customer.preferences ?? "", notes: customer.notes ?? "",
      customRate: customer.customRateCents === null ? "" : (customer.customRateCents / 100).toFixed(2),
      customMinimum: customer.customMinimumCents === null ? "" : (customer.customMinimumCents / 100).toFixed(2),
      pricingExpiresAt: localDate(customer.pricingExpiresAt), pricingReason: customer.pricingReason ?? "", active: customer.active,
    } : emptyCustomer);
    setCustomerOpen(true);
  }
  async function saveCustomer(e: React.FormEvent) {
    e.preventDefault();
    const { customRate, customMinimum, pricingExpiresAt, pricingReason, active, ...contact } = customerForm;
    const body = { action: editing ? "customer.update" : "customer.create", ...contact,
      ...(editing ? { id: editing.id, version: editing.version } : {}),
      ...(owner ? { customRateCents: customRate === "" ? null : cents(customRate), customMinimumCents: customMinimum === "" ? null : cents(customMinimum),
        pricingExpiresAt: iso(pricingExpiresAt), pricingReason, active } : {}),
    };
    const data = await mutate(body, () => setCustomerOpen(false));
    if (data?.customer) await openCustomer(data.customer.id);
  }
  async function newOrder() {
    setError("");
    try {
      // Refresh the customer picker independently of the list's search filter.
      const data = await api("");
      setCustomers(data.customers);
      const preferred = detail?.customer.active ? detail.customer.id : "";
      if (preferred && !data.customers.some((c: Customer) => c.id === preferred)) setCustomers([...data.customers, detail!.customer]);
      setOrderCustomer(preferred); setWeight(""); setDue(""); setOrderNotes(""); setOverride(false); setOverrideReason(""); setLines([]);
      orderKey.current = crypto.randomUUID(); setOrderOpen(true);
    } catch (e) { setError((e as Error).message); }
  }
  const chosenCustomer = customers.find(c => c.id === orderCustomer);
  const rateCents = override ? cents(rate) : chosenCustomer?.rateCents ?? DEFAULT_RATE_CENTS;
  const minimumCents = override ? cents(minimum) : chosenCustomer?.minimumCents ?? DEFAULT_MINIMUM_CENTS;
  let preview: { laundryCents: number; totalCents: number } | null = null;
  try { preview = quote(Math.round(Number(weight) * 100), rateCents, minimumCents, lines.map(l => ({ quantity: Number(l.quantity), unitCents: cents(l.price) }))); } catch { /* incomplete form */ }

  async function saveOrder(e: React.FormEvent) {
    e.preventDefault();
    await mutate({ action: "order.create", requestKey: orderKey.current, customerId: orderCustomer,
      weightHundredths: Math.round(Number(weight) * 100), dueAt: iso(due), notes: orderNotes,
      lines: lines.map(l => ({ description: l.description, quantity: Number(l.quantity), unitCents: cents(l.price) })),
      ...(override ? { rateCents, minimumCents, pricingReason: overrideReason } : {}),
    }, data => { setOrderOpen(false); chooseOrder(data.order); setTab("orders"); });
  }
  async function saveWork(e: React.FormEvent) {
    e.preventDefault(); if (!selected) return;
    await mutate({ action: "order.update", orderId: selected.id, version: selected.version,
      status: work.status, dueAt: iso(work.due), notes: work.notes, machineNotes: work.machineNotes, laborMinutes: Number(work.laborMinutes), reason: work.reason,
    }, data => chooseOrder(data.order));
  }
  async function savePayment(e: React.FormEvent) {
    e.preventDefault(); if (!selected) return;
    await mutate({ action: "payment.create", orderId: selected.id, requestKey: paymentKey.current, method: payment.method, kind: payment.kind,
      amountCents: cents(payment.amount), reference: payment.reference, reason: payment.reason, confirmed: payment.confirmed,
    }, data => chooseOrder(data.order));
  }
  async function reversePayment(paymentId: string) {
    if (!selected) return;
    const reason = window.prompt("Reason for reversing this record (for example, returned check). This does not move money through your bank.");
    if (!reason?.trim()) return;
    await mutate({ action: "payment.void", orderId: selected.id, paymentId, reason }, data => chooseOrder(data.order));
  }
  const visibleOrders = orders.filter(o => statusFilter === "ALL" || (statusFilter === "OPEN" ? !["PICKED_UP", "CANCELLED"].includes(o.status) : statusFilter === "UNPAID" ? o.status !== "CANCELLED" && o.balanceCents > 0 : o.status === statusFilter));
  const refreshPaymentKey = () => { paymentKey.current = crypto.randomUUID(); };
  function changePayment(values: Partial<typeof payment>) { refreshPaymentKey(); setPayment(p => ({ ...p, ...values })); }

  return <div>
    <Header title="Wash • Dry • Fold" description="Clinton Laundry Works">
      <Button disabled={busy} onClick={newOrder}><Plus className="mr-1 h-4 w-4" />New order</Button>
    </Header>
    <div className="p-4 sm:p-6 space-y-5">
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error} <button className="underline ml-2" onClick={() => { if (selected) openOrder(selected.id); else load().catch(e => setError(e.message)); }}>Reload</button></div>}
      {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
      <div className="flex gap-2">
        <Button variant={tab === "orders" ? "default" : "outline"} onClick={() => { setTab("orders"); setDetail(null); }}><ShoppingBag className="h-4 w-4 mr-2" />Orders</Button>
        <Button variant={tab === "customers" ? "default" : "outline"} onClick={() => { setTab("customers"); setSelected(null); }}><Users className="h-4 w-4 mr-2" />Customers</Button>
      </div>
      {!selected && !detail && <>
        {summary && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[["Invoiced", money(summary.totalCents)], ["Collected, net of refunds", money(summary.paidCents)], ["Outstanding", money(summary.balanceCents)], ["Pounds processed / ordered", summary.pounds.toFixed(2)]].map(([label, value]) =>
            <div key={label} className={panel}><p className="text-xs text-gray-500">{label}</p><p className="text-xl font-semibold mt-1">{value}</p></div>)}
        </div>}
        <p className="text-xs text-gray-500">Lifetime WDF totals exclude cancelled orders. Payments are recorded separately from machine revenue.</p>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><Input aria-label="Search customers or orders" className="pl-9" placeholder="Search name, phone, or order number" value={search} onChange={e => setSearch(e.target.value)} /></div>
          {tab === "orders" ? <select aria-label="Filter orders" className={selectClass + " sm:!w-48"} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="OPEN">Open orders</option><option value="ALL">All statuses</option><option value="UNPAID">Outstanding balance</option>{STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select> : <Button variant="outline" onClick={() => customerEditor()}>Add customer</Button>}
        </div>
        {loading ? <p>Loading WDF…</p> : tab === "orders" ? <div className={panel}>
          <p className="text-xs text-gray-500 mb-3">Showing matching orders from the latest 100. Search to find an older order.</p>
          {!visibleOrders.length ? <p className="py-8 text-center text-gray-500">No matching orders. Add a customer, then create your first order.</p> :
            <div className="divide-y">{visibleOrders.map(o => <button key={o.id} className="w-full py-4 text-left flex flex-wrap items-center justify-between gap-3 hover:bg-gray-50" onClick={() => openOrder(o.id)}>
              <div><p className="font-semibold">#{o.number} · {o.customerName}</p><p className="text-sm text-gray-500">{(o.weightHundredths / 100).toFixed(2)} lb · {statusLabel(o.status)} · Due {displayDate(o.dueAt)}</p></div>
              <div className="text-right"><p className="font-semibold">{money(o.totalCents)}</p><p className={o.balanceCents ? "text-sm text-amber-700" : "text-sm text-green-700"}>{o.status === "CANCELLED" ? "Cancelled" : o.balanceCents ? money(o.balanceCents) + " due" : "Paid"}</p></div>
            </button>)}</div>}
        </div> : <div className={panel}>
          <p className="text-xs text-gray-500 mb-3">Up to 100 matching customers. Search by name, phone, company, or email.</p>
          {!customers.length && <p className="py-8 text-center text-gray-500">No customers yet.</p>}
          <div className="divide-y">{customers.map(c => <button key={c.id} className="w-full py-4 text-left flex justify-between gap-3 hover:bg-gray-50" onClick={() => openCustomer(c.id)}>
            <div><p className="font-semibold">{c.name}{!c.active && " · Inactive"}</p><p className="text-sm text-gray-500">{[c.company, c.phone, c.email].filter(Boolean).join(" · ")}</p></div>
            <div className="text-right"><p>{money(c.rateCents)}/lb</p><p className="text-xs text-gray-500">{c.pricingSource === "CUSTOMER" ? "Negotiated" : "Standard"} · {c._count?.orders ?? 0} orders</p></div>
          </button>)}</div>
        </div>}
      </>}

      {detail && <div className="space-y-4">
        <Button variant="ghost" onClick={() => setDetail(null)}><ArrowLeft className="mr-2 h-4 w-4" />Customers</Button>
        <div className={panel}>
          <div className="flex justify-between gap-3"><div><h2 className="text-xl font-semibold">{detail.customer.name}</h2><p className="text-gray-500">{[detail.customer.company, detail.customer.phone, detail.customer.email].filter(Boolean).join(" · ")}</p></div>
            <Button variant="outline" onClick={() => customerEditor(detail.customer)}>Edit customer</Button></div>
          <div className="grid sm:grid-cols-3 gap-4 mt-5">
            <div><p className="text-xs text-gray-500">Current price</p><p className="font-semibold">{money(detail.customer.rateCents)}/lb · {money(detail.customer.minimumCents)} minimum</p><p className="text-sm">{detail.customer.pricingSource === "CUSTOMER" ? "Negotiated" : "Standard"}</p>
              {detail.customer.pricingExpiresAt && <p className="text-xs text-gray-500">Negotiated terms expire {displayDate(detail.customer.pricingExpiresAt)}</p>}</div>
            <div><p className="text-xs text-gray-500">Lifetime business</p><p>{detail.totals.orders} orders · {detail.totals.pounds.toFixed(2)} lb</p><p>{money(detail.totals.totalCents)} invoiced · {money(detail.totals.paidCents)} collected</p></div>
            <div><p className="text-xs text-gray-500">Realized laundry price / lb</p><p>{detail.totals.averageRateCents === null ? "—" : money(detail.totals.averageRateCents)}</p><p className="text-xs text-gray-500">Includes minimums; excludes specialty items. {detail.totals.laborMinutes} labor minutes recorded.</p></div>
          </div>
          <p className="mt-4 whitespace-pre-wrap text-sm"><strong>Preferences: </strong>{detail.customer.preferences || "None recorded"}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm"><strong>Internal notes: </strong>{detail.customer.notes || "None"}</p>
          {detail.customer.pricingReason && <p className="mt-2 text-sm"><strong>Pricing notes: </strong>{detail.customer.pricingReason}</p>}
        </div>
        <div className={panel}><h3 className="font-semibold mb-3">Order history · latest 100</h3>{!detail.orders.length && <p>No orders yet.</p>}
          {detail.orders.map(o => <button key={o.id} className="block w-full text-left border-t py-3" onClick={() => openOrder(o.id)}>#{o.number} · {displayDate(o.createdAt)} · {statusLabel(o.status)} · {money(o.totalCents)} · {money(o.balanceCents)} outstanding</button>)}
        </div>
        <div className={panel}><h3 className="font-semibold">Customer history</h3>{detail.customer.audits?.map(a => <details key={a.id} className="text-sm mt-3"><summary>{displayDate(a.createdAt)} · {a.actorName} · {statusLabel(a.action)}</summary><pre className="mt-2 whitespace-pre-wrap break-words text-xs">{JSON.stringify(a.detail, null, 2)}</pre></details>)}</div>
      </div>}

      {selected && <div className="space-y-4">
        <div className="flex flex-wrap gap-2 justify-between"><Button variant="ghost" onClick={() => setSelected(null)}><ArrowLeft className="mr-2 h-4 w-4" />Orders</Button>
          <div className="flex gap-2"><a target="_blank" rel="noopener noreferrer" href={"/wdf/print/" + selected.id}><Button variant="outline"><Printer className="mr-2 h-4 w-4" />Invoice / receipt</Button></a><a target="_blank" rel="noopener noreferrer" href={"/wdf/print/" + selected.id + "?ticket=1"}><Button variant="outline">Bag ticket</Button></a></div>
        </div>
        <div className={panel}><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-semibold">Order #{selected.number}</h2><button className="text-blue-600 underline" onClick={() => openCustomer(selected.customerId)}>{selected.customerName}</button><p className="text-sm text-gray-500">{selected.customerPhone}</p></div>
          <div className="text-right"><p className="text-2xl font-semibold">{money(selected.totalCents)}</p><p>{selected.status === "CANCELLED" ? "Cancelled" : money(selected.balanceCents) + " outstanding"}</p></div></div>
          <div className="mt-4 text-sm space-y-2">
            {selected.weightHundredths > 0 && <p>{(selected.weightHundredths / 100).toFixed(2)} lb × {money(selected.rateCents)}/lb = {money(selected.laundryCents)} <span className="text-gray-500">(minimum {money(selected.minimumCents)})</span></p>}
            {selected.lines.map(l => <p key={l.id}>{l.quantity} × {l.description} @ {money(l.unitCents)} = {money(l.totalCents)}</p>)}
            <p className="text-gray-500">{statusLabel(selected.pricingSource)} pricing saved with this order. {selected.pricingReason}</p>
            <p className="whitespace-pre-wrap"><strong>Laundry preferences: </strong>{selected.preferences || "None recorded"}</p>
          </div>
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <form onSubmit={saveWork} className={panel + " space-y-4"}><h3 className="font-semibold">Processing</h3>
            <Field label="Status"><select disabled={selected.status === "CANCELLED"} className={selectClass} value={work.status} onChange={e => setWork(w => ({ ...w, status: e.target.value }))}>
              {STATUSES.filter(s => s === selected.status || (owner && selected.status !== "CANCELLED" ? true : STATUSES.indexOf(s) === STATUSES.indexOf(selected.status as typeof STATUSES[number]) + 1 && s !== "CANCELLED")).map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select></Field>
            {work.status === "PICKED_UP" && selected.balanceCents > 0 && <p className="text-amber-700 text-sm">This order still has {money(selected.balanceCents)} due. Pickup does not mark it paid.</p>}
            {work.status === "CANCELLED" && selected.status !== "CANCELLED" && <Field label="Cancellation reason"><Input required value={work.reason} onChange={e => setWork(w => ({ ...w, reason: e.target.value }))} /></Field>}
            <Field label="Promised pickup"><Input type="datetime-local" value={work.due} onChange={e => setWork(w => ({ ...w, due: e.target.value }))} /></Field>
            <Field label="Total hands-on labor minutes"><Input type="number" min="0" max="100000" step="1" required value={work.laborMinutes} onChange={e => setWork(w => ({ ...w, laborMinutes: e.target.value }))} /></Field>
            <Field label="Washers / dryers used"><Input placeholder="Washer 3; dryer 7; 2 cycles" value={work.machineNotes} onChange={e => setWork(w => ({ ...w, machineNotes: e.target.value }))} /></Field>
            <Field label="Internal order notes"><Textarea value={work.notes} onChange={e => setWork(w => ({ ...w, notes: e.target.value }))} /></Field>
            <Button disabled={busy || selected.status === "CANCELLED"}>Save processing</Button>
          </form>
          <div className={panel + " space-y-4"}><h3 className="font-semibold">Payments</h3>
            <p className="text-sm">Recorded: {money(selected.paidCents)} · Balance: {money(selected.balanceCents)}</p>
            {selected.status !== "CANCELLED" && <form onSubmit={savePayment} className="space-y-3">
              {owner && <Field label="Entry type"><select className={selectClass} value={payment.kind} onChange={e => changePayment({ kind: e.target.value, confirmed: false, amount: "" })}><option value="PAYMENT">Payment received</option><option value="REFUND">Refund issued</option></select></Field>}
              <div className="grid grid-cols-2 gap-3"><Field label="Method"><select className={selectClass} value={payment.method} onChange={e => changePayment({ method: e.target.value, confirmed: false, reference: "", tendered: "" })}><option value="CASH">Cash</option><option value="CHECK">Check</option><option value="CARD">Credit card</option></select></Field>
                <Field label="Amount ($)"><Input required type="number" min="0.01" step="0.01" value={payment.amount} onChange={e => changePayment({ amount: e.target.value })} /></Field></div>
              {payment.method === "CASH" && payment.kind === "PAYMENT" && <><Field label="Cash tendered ($, optional)"><Input type="number" step="0.01" min={payment.amount || "0"} value={payment.tendered} onChange={e => setPayment(p => ({ ...p, tendered: e.target.value }))} /></Field>{payment.tendered && <p className="text-sm">Change due: {money(Math.max(0, cents(payment.tendered) - cents(payment.amount)))}</p>}</>}
              <Field label={payment.method === "CHECK" ? "Check number" : "Transaction reference (optional)"}><Input required={payment.method === "CHECK"} value={payment.reference} onChange={e => changePayment({ reference: e.target.value })} /></Field>
              {payment.kind === "REFUND" && <Field label="Refund reason"><Input required value={payment.reason} onChange={e => changePayment({ reason: e.target.value })} /></Field>}
              {payment.method === "CARD" && <label className="flex items-start gap-2 text-sm"><input required type="checkbox" checked={payment.confirmed} onChange={e => changePayment({ confirmed: e.target.checked })} /><span>I confirmed this {payment.kind === "REFUND" ? "refund" : "charge"} succeeded in the bank app.</span></label>}
              <p className="text-xs text-gray-500">This records money already received or refunded. Card transactions happen in your bank app. Checks are recorded on receipt; reverse a returned check.</p>
              <Button disabled={busy || !payment.amount}>{payment.kind === "REFUND" ? "Record refund" : "Record payment"}</Button>
            </form>}
            <div className="divide-y">{selected.payments.map(p => <div key={p.id} className={"py-3 text-sm " + (p.voidedAt ? "text-gray-400" : "")}>
              <p className="font-medium">{money(p.amountCents)} · {statusLabel(p.method)} · {statusLabel(p.kind)}{p.voidedAt ? " · Reversed" : ""}</p>
              <p>{displayDate(p.createdAt)} · {p.recordedByName}</p>{p.reference && <p>Reference: {p.reference}</p>}{p.reason && <p>{p.reason}</p>}{p.voidReason && <p>Correction: {p.voidReason}</p>}
              {owner && !p.voidedAt && selected.status !== "CANCELLED" && <button disabled={busy} className="text-red-700 underline mt-1" onClick={() => reversePayment(p.id)}>Reverse record / returned check</button>}
            </div>)}</div>
          </div>
        </div>
        <div className={panel}><h3 className="font-semibold">Order history</h3>{selected.audits.map(a => <details key={a.id} className="mt-3 text-sm"><summary>{displayDate(a.createdAt)} · {a.actorName} · {statusLabel(a.action)}</summary><pre className="mt-2 whitespace-pre-wrap break-words text-xs">{JSON.stringify(a.detail, null, 2)}</pre></details>)}</div>
      </div>}

      <Dialog open={customerOpen} onOpenChange={v => { if (!busy) setCustomerOpen(v); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editing ? "Edit customer" : "New WDF customer"}</DialogTitle></DialogHeader>
          <form onSubmit={saveCustomer} className="space-y-3">
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <Field label="Customer name"><Input required maxLength={200} value={customerForm.name} onChange={e => setCustomerForm(f => ({ ...f, name: e.target.value }))} /></Field>
            <Field label="Company"><Input value={customerForm.company} onChange={e => setCustomerForm(f => ({ ...f, company: e.target.value }))} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Phone"><Input type="tel" value={customerForm.phone} onChange={e => setCustomerForm(f => ({ ...f, phone: e.target.value }))} /></Field><Field label="Email"><Input type="email" value={customerForm.email} onChange={e => setCustomerForm(f => ({ ...f, email: e.target.value }))} /></Field></div>
            <Field label="Laundry preferences"><Textarea placeholder="Fragrance-free, temperature, hang-dry instructions…" value={customerForm.preferences} onChange={e => setCustomerForm(f => ({ ...f, preferences: e.target.value }))} /></Field>
            <Field label="Internal customer notes"><Textarea value={customerForm.notes} onChange={e => setCustomerForm(f => ({ ...f, notes: e.target.value }))} /></Field>
            {owner && <div className="space-y-3 border-t pt-3"><p className="text-sm font-semibold">Negotiated pricing</p><p className="text-xs text-gray-500">Leave blank for $2.00/lb and a $25.00 minimum. Expiration applies to both negotiated terms.</p>
              <div className="grid grid-cols-2 gap-3"><Field label="Custom $/lb"><Input type="number" min="0.01" max="100" step="0.01" value={customerForm.customRate} onChange={e => setCustomerForm(f => ({ ...f, customRate: e.target.value }))} /></Field>
                <Field label="Custom minimum ($)"><Input type="number" min="0" max="10000" step="0.01" value={customerForm.customMinimum} onChange={e => setCustomerForm(f => ({ ...f, customMinimum: e.target.value }))} /></Field></div>
              <Field label="Terms expire (optional)"><Input type="datetime-local" value={customerForm.pricingExpiresAt} onChange={e => setCustomerForm(f => ({ ...f, pricingExpiresAt: e.target.value }))} /></Field>
              <Field label="Pricing reason / agreement"><Textarea required={customerForm.customRate !== "" || customerForm.customMinimum !== ""} value={customerForm.pricingReason} onChange={e => setCustomerForm(f => ({ ...f, pricingReason: e.target.value }))} /></Field>
              {editing && <label className="flex gap-2 text-sm"><input type="checkbox" checked={customerForm.active} onChange={e => setCustomerForm(f => ({ ...f, active: e.target.checked }))} />Active customer</label>}
            </div>}
            <Button disabled={busy} className="w-full">Save customer</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={orderOpen} onOpenChange={v => { if (!busy) setOrderOpen(v); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>New WDF order</DialogTitle></DialogHeader>
          <form onSubmit={saveOrder} className="space-y-4">
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <Field label="Customer"><select required className={selectClass} value={orderCustomer} onChange={e => { setOrderCustomer(e.target.value); orderKey.current = crypto.randomUUID(); }}><option value="">Select customer</option>{customers.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name} · {money(c.rateCents)}/lb</option>)}</select></Field>
            <p className="text-xs text-gray-500">Missing a customer? Close this window and add them under Customers. The picker shows up to 100; search Customers and open their profile for older accounts.</p>
            {chosenCustomer?.preferences && <p className="whitespace-pre-wrap text-sm rounded bg-blue-50 p-3">{chosenCustomer.preferences}</p>}
            <Field label="Dry laundry weight (lb)"><Input type="number" min="0" max="10000" step="0.01" required value={weight} onChange={e => { setWeight(e.target.value); orderKey.current = crypto.randomUUID(); }} /></Field>
            <p className="text-sm">{money(rateCents)}/lb · {money(minimumCents)} minimum · {override ? "Order override" : chosenCustomer?.pricingSource === "CUSTOMER" ? "Negotiated customer terms" : "Standard pricing"}</p>
            {owner && <><label className="flex gap-2 text-sm"><input type="checkbox" checked={override} onChange={e => { setOverride(e.target.checked); setRate(((chosenCustomer?.rateCents ?? 200) / 100).toFixed(2)); setMinimum(((chosenCustomer?.minimumCents ?? 2500) / 100).toFixed(2)); orderKey.current = crypto.randomUUID(); }} />Override price for this order</label>
              {override && <div className="space-y-3"><div className="grid grid-cols-2 gap-3"><Field label="$/lb"><Input required type="number" min="0.01" max="100" step="0.01" value={rate} onChange={e => { setRate(e.target.value); orderKey.current = crypto.randomUUID(); }} /></Field><Field label="Minimum ($)"><Input required type="number" min="0" step="0.01" value={minimum} onChange={e => { setMinimum(e.target.value); orderKey.current = crypto.randomUUID(); }} /></Field></div>
                <Field label="Override reason"><Input required value={overrideReason} onChange={e => { setOverrideReason(e.target.value); orderKey.current = crypto.randomUUID(); }} /></Field></div>}
              {lines.map((l, i) => <div key={i} className="space-y-2 border rounded p-3"><Field label="Specialty item"><Input required value={l.description} onChange={e => { setLines(ls => ls.map((x, j) => i === j ? { ...x, description: e.target.value } : x)); orderKey.current = crypto.randomUUID(); }} /></Field>
                <div className="grid grid-cols-2 gap-2"><Field label="Quantity"><Input required type="number" min="1" step="1" value={l.quantity} onChange={e => { setLines(ls => ls.map((x, j) => i === j ? { ...x, quantity: e.target.value } : x)); orderKey.current = crypto.randomUUID(); }} /></Field><Field label="Price each ($)"><Input required type="number" min="0.01" step="0.01" value={l.price} onChange={e => { setLines(ls => ls.map((x, j) => i === j ? { ...x, price: e.target.value } : x)); orderKey.current = crypto.randomUUID(); }} /></Field></div>
                <button type="button" className="text-sm text-red-700 underline" onClick={() => { setLines(ls => ls.filter((_, j) => i !== j)); orderKey.current = crypto.randomUUID(); }}>Remove item</button></div>)}
              <Button type="button" variant="outline" disabled={lines.length >= 30} onClick={() => { setLines(ls => [...ls, { description: "", quantity: "1", price: "" }]); orderKey.current = crypto.randomUUID(); }}>Add bedding / specialty item</Button>
            </>}
            <Field label="Promised pickup"><Input type="datetime-local" value={due} onChange={e => { setDue(e.target.value); orderKey.current = crypto.randomUUID(); }} /></Field>
            <Field label="Internal order notes"><Textarea value={orderNotes} onChange={e => { setOrderNotes(e.target.value); orderKey.current = crypto.randomUUID(); }} /></Field>
            <p className="text-xl font-semibold">Total: {preview ? money(preview.totalCents) : "—"}</p>
            <p className="text-xs text-gray-500">Weight 0 is allowed for specialty-only orders. Prices are confirmed and saved by the server when you create the order.</p>
            <Button disabled={busy || !preview || !chosenCustomer} className="w-full">Create order</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  </div>;
}
