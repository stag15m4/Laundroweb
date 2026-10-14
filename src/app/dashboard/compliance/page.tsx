"use client";
import { ComplianceWorkPanel } from "@/components/ComplianceWorkPanel";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deadlineTypes, recurrences } from "@/lib/compliance";

type Deadline = { id: string; title: string; notes: string | null; dueDate: string; deadlineType: string; status: string; recurrence: string; workflowId: string | null; };
const blank = { title: "", notes: "", dueDate: "", deadlineType: "other", recurrence: "none" };
const label = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const civil = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
export default function CompliancePage() {
  const { data: session } = useSession();
  const owner = (session?.user as { role?: string })?.role === "OWNER";
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    const res = await fetch("/api/compliance", { cache: "no-store" });
    if (!res.ok) throw new Error("Unable to load compliance deadlines");
    setDeadlines(await res.json());
  }
  useEffect(() => { if (owner) load().catch(e => setError(e.message)); }, [owner]);
  async function save(path: string, method: string, body?: unknown) {
    setBusy(true); setError("");
    try {
      const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Unable to save deadline"); }
      await load(); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save deadline"); return false; }
    finally { setBusy(false); }
  }
  if (!owner) return <ComplianceWorkPanel tenantId="laundroweb" />;
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const count = new Date(month.getFullYear(), month.getMonth()+1, 0).getDate();
  const days = Array.from({ length: Math.ceil((first.getDay()+count)/7)*7 }, (_, i) => i-first.getDay()+1);
  return <div className="space-y-6">
    <ComplianceWorkPanel tenantId="laundroweb" />
    <div><h1 className="text-2xl font-bold">Compliance calendar</h1><p className="text-gray-500 text-sm mt-1">Track licenses, PCI compliance, insurance, and renewals. Connect this business in Legal to include its deadlines in your central calendar.</p></div>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
    <Card><CardHeader><div className="flex justify-between items-center gap-2"><Button variant="outline" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()-1, 1))} aria-label="Previous month">←</Button><CardTitle>{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</CardTitle><Button variant="outline" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()+1, 1))} aria-label="Next month">→</Button></div></CardHeader><CardContent>
      <div className="grid grid-cols-7 text-xs text-gray-500 text-center mb-2">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <span key={d}>{d}</span>)}</div>
      <div className="grid grid-cols-7 border-l border-t">{days.map((d,i) => {
        const date = civil(new Date(month.getFullYear(),month.getMonth(),d));
        return <div key={i} className="min-h-24 border-r border-b p-1 sm:p-2">{d > 0 && d <= count && <><button className="text-sm font-medium" onClick={() => { setEditing(null); setForm({ ...blank, dueDate: date }); }}>{d}</button>{deadlines.filter(t => t.dueDate === date && t.status !== "cancelled").map(t => <button key={t.id} className={`block mt-1 text-left w-full rounded p-1 text-xs break-words ${t.status === "completed" ? "bg-green-100 text-green-800" : "bg-purple-100 text-purple-800"}`} onClick={() => { setEditing(t.id); setForm({ ...t, notes: t.notes || "" }); }}>{t.status === "completed" ? "✓ " : ""}{t.title}</button>)}</>}</div>;
      })}</div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{editing ? "Edit deadline" : "Add deadline"}</CardTitle></CardHeader><CardContent>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={async e => { e.preventDefault(); if (await save(editing ? `/api/compliance/${editing}` : "/api/compliance", editing ? "PATCH" : "POST", form)) { setForm(blank); setEditing(null); } }}>
        <label className="text-sm">Title<Input required maxLength={500} value={form.title} onChange={e => setForm({ ...form,title:e.target.value })} placeholder="PCI compliance renewal" /></label>
        <label className="text-sm">Due date<Input required type="date" value={form.dueDate} onChange={e => setForm({ ...form,dueDate:e.target.value })} /></label>
        <label className="text-sm">Type<select className="block border rounded p-2 w-full" value={form.deadlineType} onChange={e => setForm({ ...form,deadlineType:e.target.value })}>{deadlineTypes.map(t => <option key={t} value={t}>{t === "pci_compliance" ? "PCI Compliance" : label(t)}</option>)}</select></label>
        <label className="text-sm">Repeat<select className="block border rounded p-2 w-full" value={form.recurrence} onChange={e => setForm({ ...form,recurrence:e.target.value })}>{recurrences.map(r => <option key={r} value={r}>{label(r)}</option>)}</select></label>
        <label className="sm:col-span-2 text-sm">Notes<textarea className="block border rounded p-2 w-full" maxLength={50000} value={form.notes} onChange={e => setForm({ ...form,notes:e.target.value })} /></label>
        <div className="flex gap-2"><Button disabled={busy}>{busy ? "Saving…" : "Save deadline"}</Button>{editing && <Button type="button" variant="outline" onClick={() => {setEditing(null);setForm(blank);}}>Cancel edit</Button>}</div>
      </form>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>All deadlines</CardTitle></CardHeader><CardContent><div className="space-y-3">{deadlines.map(t => <div key={t.id} className="border rounded p-3 flex flex-wrap justify-between gap-3"><div><p className="font-medium">{t.title}</p><p className="text-sm text-gray-500">{t.dueDate} · {label(t.status)} · Repeat: {label(t.recurrence)}{t.workflowId && " · Owner verification required"}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => {setEditing(t.id);setForm({...t,notes:t.notes || ""});}}>Edit</Button><Button variant="outline" disabled={busy || !!t.workflowId} onClick={() => save(`/api/compliance/${t.id}`,"PATCH",{status:t.status === "completed" ? "pending" : "completed"})}>{t.status === "completed" ? "Reopen" : "Complete"}</Button><Button variant="outline" disabled={busy || !!t.workflowId} onClick={() => save(`/api/compliance/${t.id}`,"PATCH",{status:t.status === "cancelled" ? "pending" : "cancelled"})}>{t.status === "cancelled" ? "Restore" : "Cancel"}</Button><Button variant="outline" disabled={busy || !!t.workflowId} onClick={() => {if (confirm("Delete this deadline? It will also be removed from Legal on the next successful sync.")) save(`/api/compliance/${t.id}`,"DELETE");}}>Delete</Button></div></div>)}{!deadlines.length && <p className="text-gray-500">No compliance deadlines yet.</p>}</div></CardContent></Card>
  </div>;
}
