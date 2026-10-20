
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Input } from "@/components/ui/input";
import { LinenAccount } from "@/components/LinenAccount";
import { money, displayDate } from "@/lib/wdf-types";

type Row = { id: string; customerId: string; itemName: string; active: boolean; weeklyFeeCents: number | null; exchangeDay: number | null;
  customer: { name: string; phone: string | null; active: boolean }; balance: { towels: number; bags: number }; exchanges: { occurredAt: string }[] };
type Customer = { id: string; name: string; active: boolean };
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function LinenDesk() {
  const [plans, setPlans] = useState<Row[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("customerId");
    if (id) setSelected(id);
    fetch("/api/wdf?linen=1", { cache: "no-store" }).then(async r => {
      const d = await r.json(); if (!r.ok) throw new Error(d.message); setPlans(d.plans);
    }).catch(e => setError(e.message));
  }, []);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch("/api/wdf?q=" + encodeURIComponent(query), { cache: "no-store" }).then(async r => {
        const d = await r.json(); if (!r.ok) throw new Error(d.message);
        if (!cancelled) setCustomers(d.customers);
      }).catch(e => { if (!cancelled) setError(e.message); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);
  return <div><Header title="Linen rental" description="Weekly accounts, towel exchanges and reusable bags"><Link className="text-sm text-blue-700 underline" href="/dashboard/wdf">WDF orders / customers</Link></Header>
    <div className="p-4 sm:p-6 space-y-4">
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {selected ? <><button className="text-sm text-blue-700 underline" onClick={() => { setSelected(""); fetch("/api/wdf?linen=1", { cache: "no-store" }).then(r => r.json()).then(d => { if (d.plans) setPlans(d.plans); }).catch(e => setError(e.message)); }}>Back to rental accounts</button><LinenAccount key={selected} customerId={selected} /></> : <>
        <div className="rounded-xl border bg-white p-4 space-y-3"><h2 className="font-semibold">Open a customer rental account</h2>
          <Input aria-label="Search rental customers" placeholder="Search CRM customers by name, company, email or phone" value={query} onChange={e => setQuery(e.target.value)} />
          <select aria-label="Select customer" className="w-full rounded border p-2 bg-white text-sm" value="" onChange={e => setSelected(e.target.value)}><option value="">Choose customer…</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.active ? "" : " (inactive)"}</option>)}</select>
          <p className="text-xs text-gray-500">Create new customers under WDF Customers. Rental pricing is separate from per-pound pricing.</p>
        </div>
        <div className="rounded-xl border bg-white p-4"><h2 className="font-semibold mb-3">Rental accounts</h2>
          {!plans.length && <p className="text-sm text-gray-500">No rental agreements yet.</p>}
          {plans.map(p => <button key={p.id} className="w-full text-left border-t py-4 flex flex-wrap justify-between gap-3" onClick={() => setSelected(p.customerId)}>
            <div><p className="font-semibold">{p.customer.name}{p.active && p.customer.active ? "" : " · Paused"}</p><p className="text-sm text-gray-500">{p.itemName} · {p.exchangeDay === null ? "Day not set" : days[p.exchangeDay]} · {p.weeklyFeeCents === null ? "Price not set" : money(p.weeklyFeeCents) + "/week"}</p><p className="text-xs text-gray-500">Last stock movement: {displayDate(p.exchanges[0]?.occurredAt ?? null)}</p></div>
            <div className="text-sm">{p.balance.towels} towels · {p.balance.bags} bags at customer</div>
          </button>)}
        </div>
      </>}
    </div>
  </div>;
}
