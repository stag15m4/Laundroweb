
"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Order, money, displayDate, statusLabel } from "@/lib/wdf-types";

export function WdfPrint({ id }: { id: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const ticket = useSearchParams().get("ticket") === "1";
  useEffect(() => {
    fetch("/api/wdf?orderId=" + encodeURIComponent(id), { cache: "no-store" }).then(async res => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not load order.");
      setOrder(data.order);
    }).catch(e => setError(e.message));
  }, [id]);
  return <main className="mx-auto max-w-3xl bg-white p-6 sm:p-10 text-gray-950">
    <style>{"@media print { .no-print { display: none !important; } body { background: white; } @page { margin: 15mm; } tr { break-inside: avoid; } }"}</style>
    <div className="no-print mb-8 flex gap-4 text-sm"><button disabled={!order} onClick={() => window.print()} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">Print {ticket ? "bag ticket" : "invoice / receipt"}</button><a href="/dashboard/wdf" className="py-2 underline">Back to WDF</a></div>
    {error ? <p role="alert">{error}</p> : !order ? <p>Loading…</p> : <>
      <h1 className="text-2xl font-bold">Clinton Laundry Works</h1>
      <p className="mt-2 text-lg font-semibold">{ticket ? "WDF BAG TICKET" : order.status === "CANCELLED" ? "CANCELLED INVOICE" : order.balanceCents === 0 ? "PAID RECEIPT" : "WDF INVOICE"} #{order.number}</p>
      <div className="mt-6 grid grid-cols-2 gap-4"><div><p className="font-bold text-lg">{order.customerName}</p><p>{order.customerPhone}</p>{!ticket && <p>{order.customerEmail}</p>}</div><div><p>Received: {displayDate(order.createdAt)}</p><p>Promised pickup: {displayDate(order.dueAt)}</p><p>Status: {statusLabel(order.status)}</p></div></div>
      {!ticket && order.billingAddress && <p className="mt-3 text-sm">Bill to: {order.billingAddress}</p>}
      {order.serviceLocation && <div className="mt-3 text-sm"><p>{order.fulfillment === "PICKUP" ? "Customer pickup" : order.fulfillment === "LINEN" ? "Primary linen location" : "Delivery"}: {order.serviceLocation.inputAddress}</p><p>Service county: {order.serviceLocation.county}, {order.serviceLocation.state}</p></div>}
      {ticket ? <div className="mt-6 space-y-5">
        <p className="text-2xl font-bold">{(order.weightHundredths / 100).toFixed(2)} lb</p>
        <div><h2 className="font-semibold">Laundry preferences</h2><p className="whitespace-pre-wrap">{order.preferences || "None recorded"}</p></div>
        {order.lines.length > 0 && <div><h2 className="font-semibold">Specialty items</h2>{order.lines.map(l => <p key={l.id}>{l.quantity} × {l.description}</p>)}</div>}
        <div><h2 className="font-semibold">Order instructions</h2><p className="whitespace-pre-wrap">{order.notes || "None recorded"}</p></div>
        <p>Machines used: {order.machineNotes || "________________________"}</p><p>Attendant: ________________________</p>
      </div> : <>
        <table className="w-full mt-8 text-sm"><thead><tr className="border-b-2 text-left"><th className="py-2">Service</th><th className="py-2 text-right">Amount</th></tr></thead><tbody>
          {order.weightHundredths > 0 && <tr className="border-b"><td className="py-3">Wash, dry & fold · {(order.weightHundredths / 100).toFixed(2)} lb @ {money(order.rateCents)}/lb<br /><span className="text-xs text-gray-600">Minimum charge: {money(order.minimumCents)}</span></td><td className="text-right">{money(order.laundryCents)}</td></tr>}
          {order.lines.map(l => <tr className="border-b" key={l.id}><td className="py-3">{l.quantity} × {l.description} @ {money(l.unitCents)}</td><td className="text-right">{money(l.totalCents)}</td></tr>)}
        </tbody></table>
        <div className="mt-5 space-y-2 text-right"><p className="text-lg font-bold">Invoice total: {money(order.totalCents)}</p><p>Payments less refunds: {money(order.paidCents)}</p><p className="text-xl font-bold">{order.status === "CANCELLED" ? "Cancelled — no amount due" : "Balance due: " + money(order.balanceCents)}</p></div>
        {order.payments.length > 0 && <div className="mt-8"><h2 className="font-semibold border-b pb-2">Payment history</h2>{order.payments.map(p => <div key={p.id} className="mt-3 text-sm"><p>{displayDate(p.createdAt)} · {statusLabel(p.method)} · {money(p.amountCents)}{p.voidedAt ? " · REVERSED" : ""}</p>{p.reference && <p>Reference: {p.reference}</p>}</div>)}</div>}
        <p className="mt-10 text-sm">Thank you for choosing Clinton Laundry Works.</p>
      </>}
    </>}
  </main>;
}
