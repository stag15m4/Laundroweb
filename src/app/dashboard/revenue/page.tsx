"use client";

import { Fragment, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { CollectQuartersDialog } from "@/components/revenue/CollectQuartersDialog";
import { CashOnHandCard } from "@/components/revenue/CashOnHandCard";
import { PageTabs } from "@/components/layout/PageTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Trash2, Pencil, DollarSign, ChevronDown, ChevronRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, startOfMonth, eachDayOfInterval, endOfMonth } from "date-fns";

type RevenueEntry = {
  id: string;
  date: string;
  amount: string;
  source: string;
  notes: string | null;
  collectedBy: string | null;
  machine: { id: string; name: string } | null;
  machineType: string | null;
  collectionId: string | null;
};

type ChangerLog = { id: string; date: string; amount: string; collectionId: string | null };

type Machine = { id: string; name: string; type: string };

// One Collect Quarters or Collect Vending Revenue round writes several
// RevenueEntry rows (one per machine) plus, for a quarters round, a
// CoinChangerLog row -- all sharing one collectionId. Grouping them back
// together here is what turns "9 scattered rows" into "one pull, one
// total", with the breakdown still one click away.
type DisplayRow =
  | { kind: "single"; date: string; entry: RevenueEntry }
  | {
      kind: "group";
      date: string;
      collectionId: string;
      total: number;
      sourceLabel: string;
      collectedBy: string | null;
      entries: RevenueEntry[];
      changerAmount: number | null;
    };

function sourceLabelFor(entries: RevenueEntry[]): string {
  return entries[0]?.source === "VENDING" ? "Vending" : "Washers & Dryers";
}

function buildDisplayRows(entries: RevenueEntry[], changerLogs: ChangerLog[]): DisplayRow[] {
  const byCollection = new Map<string, RevenueEntry[]>();
  const singles: RevenueEntry[] = [];

  for (const entry of entries) {
    if (entry.collectionId) {
      const list = byCollection.get(entry.collectionId) ?? [];
      list.push(entry);
      byCollection.set(entry.collectionId, list);
    } else {
      singles.push(entry);
    }
  }

  const rows: DisplayRow[] = singles.map((entry) => ({ kind: "single", date: entry.date, entry }));

  for (const [collectionId, group] of byCollection) {
    const changer = changerLogs.find((c) => c.collectionId === collectionId) ?? null;
    const entryTotal = group.reduce((s, e) => s + Number(e.amount), 0);
    rows.push({
      kind: "group",
      date: group[0].date,
      collectionId,
      total: entryTotal + Number(changer?.amount ?? 0),
      sourceLabel: sourceLabelFor(group),
      collectedBy: group[0].collectedBy,
      entries: group,
      changerAmount: changer ? Number(changer.amount) : null,
    });
  }

  return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * The generated notes from tools like quarter collection pack several facts
 * into one string (period, weight, a changer-cash aside, ...) -- useful for
 * an audit, distracting in a table row. Show just the first sentence; the
 * full text is still one click away via the entry's detail dialog.
 */
const MACHINE_TYPE_LABELS: Record<string, string> = { WASHER: "Washers", DRYER: "Dryers", VENDING: "Vending" };

function noteSummary(notes: string): { summary: string; truncated: boolean } {
  const sentenceEnd = notes.indexOf(". ");
  let summary = sentenceEnd === -1 ? notes : notes.slice(0, sentenceEnd + 1);
  const truncated = summary.length < notes.length;
  if (summary.length > 90) summary = `${summary.slice(0, 87)}…`;
  return { summary, truncated: truncated || summary.endsWith("…") };
}

export default function RevenuePage() {
  const { data: session } = useSession();
  const isOwner = (session?.user as { role?: string })?.role === "OWNER";

  const [entries, setEntries] = useState<RevenueEntry[]>([]);
  const [changerLogs, setChangerLogs] = useState<ChangerLog[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [open, setOpen] = useState(false);
  const [noteDetail, setNoteDetail] = useState<RevenueEntry | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const emptyForm = {
    date: format(new Date(), "yyyy-MM-dd"),
    amount: "",
    source: "COIN",
    machineId: "",
    machineType: "",
    notes: "",
    collectedBy: "",
  };
  const [form, setForm] = useState(emptyForm);
  // Set only while editing: the full original timestamp of the entry being
  // edited, so saving an edit to (say) "Collected By" on a quarter-collection
  // entry doesn't silently round its precise collection time down to
  // midnight -- the date input only offers a calendar day, so the original
  // time-of-day is reapplied to whatever day comes out of the form.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOriginalDate, setEditingOriginalDate] = useState<string | null>(null);
  // Bumped after anything that could change Cash on Hand (a collection, or
  // adding/editing/deleting an entry) -- CashOnHandCard has no other way to
  // know any of that happened, since none of it runs inside that component.
  const [cashRefreshToken, setCashRefreshToken] = useState(0);
  const refreshCash = () => setCashRefreshToken((t) => t + 1);

  function refreshEntries() {
    fetch("/api/revenue").then((r) => r.json()).then(setEntries);
    fetch("/api/cash/changer-log").then((r) => r.json()).then((d) => Array.isArray(d) && setChangerLogs(d));
  }

  useEffect(() => {
    refreshEntries();
    fetch("/api/equipment").then((r) => r.json()).then(setMachines);
  }, []);

  const total = entries.reduce((s, e) => s + Number(e.amount), 0);
  const displayRows = buildDisplayRows(entries, changerLogs);

  function toggleGroup(collectionId: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(collectionId)) next.delete(collectionId);
      else next.add(collectionId);
      return next;
    });
  }

  const chartData = (() => {
    const now = new Date();
    const days = eachDayOfInterval({ start: startOfMonth(now), end: endOfMonth(now) });
    return days.map((day) => {
      const key = format(day, "yyyy-MM-dd");
      const dayTotal = entries
        .filter((e) => format(new Date(e.date), "yyyy-MM-dd") === key)
        .reduce((s, e) => s + Number(e.amount), 0);
      return { day: format(day, "d"), amount: dayTotal };
    });
  })();

  function openAdd() {
    setEditingId(null);
    setEditingOriginalDate(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(entry: RevenueEntry) {
    setEditingId(entry.id);
    setEditingOriginalDate(entry.date);
    setForm({
      date: format(new Date(entry.date), "yyyy-MM-dd"),
      amount: entry.amount,
      source: entry.source,
      machineId: entry.machine?.id ?? "",
      machineType: entry.machineType ?? "",
      notes: entry.notes ?? "",
      collectedBy: entry.collectedBy ?? "",
    });
    setOpen(true);
  }

  // Combines the form's chosen calendar day with the original entry's own
  // time-of-day (in the browser's local time, same as the date input means
  // it) -- so editing a field that isn't the date never moves the instant.
  function withPreservedTime(dateOnly: string, originalIso: string): string {
    const original = new Date(originalIso);
    // If the calendar date wasn't touched, hand back the original instant
    // untouched rather than reconstructing it. setFullYear sets the local
    // Y-M-D while keeping the local H:M:S, but during a DST fall-back the
    // 1-2am hour happens twice; asked to rebuild an unambiguous instant
    // that fell in the second occurrence, it silently resolves to the
    // first instead, moving the timestamp an hour early even though
    // nothing about the date actually changed.
    if (format(original, "yyyy-MM-dd") === dateOnly) return originalIso;
    const [y, m, d] = dateOnly.split("-").map(Number);
    const combined = new Date(original);
    combined.setFullYear(y, m - 1, d);
    return combined.toISOString();
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const date = editingId && editingOriginalDate ? withPreservedTime(form.date, editingOriginalDate) : form.date;
    const res = await fetch(editingId ? `/api/revenue/${editingId}` : "/api/revenue", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, date }),
    });
    if (res.ok) {
      const entry = await res.json();
      setEntries((prev) =>
        editingId ? prev.map((x) => (x.id === entry.id ? entry : x)) : [entry, ...prev]
      );
      setOpen(false);
      setEditingId(null);
      setEditingOriginalDate(null);
      setForm(emptyForm);
      refreshCash();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this entry?")) return;
    await fetch(`/api/revenue/${id}`, { method: "DELETE" });
    setEntries((prev) => prev.filter((e) => e.id !== id));
    refreshCash();
  }

  // `indented` is true for a row shown inside an expanded collection group,
  // so its own date/notes line reads as "part of that pull" rather than a
  // second, unrelated entry on the same day.
  function renderEntryRow(e: RevenueEntry, indented = false) {
    const note = e.notes ? noteSummary(e.notes) : null;
    return (
      <tr key={e.id} className={`border-b border-gray-50 hover:bg-gray-50 ${indented ? "bg-gray-50/60" : ""}`}>
        <td className={`px-6 py-3 ${indented ? "pl-12 text-gray-400" : ""}`}>{formatDate(e.date)}</td>
        <td className={`px-6 py-3 font-semibold ${indented ? "text-gray-500" : "text-green-600"}`}>
          {formatCurrency(e.amount)}
        </td>
        <td className="px-6 py-3"><Badge variant="secondary">{e.source}</Badge></td>
        <td className="px-6 py-3 text-gray-500">
          {e.machine?.name ?? (e.machineType ? MACHINE_TYPE_LABELS[e.machineType] ?? e.machineType : "—")}
        </td>
        <td className="px-6 py-3 text-gray-500">{e.collectedBy ?? "—"}</td>
        <td className="px-6 py-3 text-gray-400">
          {note ? (
            <button
              type="button"
              onClick={() => setNoteDetail(e)}
              aria-label={`View full note for ${formatDate(e.date)} ${e.machine?.name ?? (e.machineType ? MACHINE_TYPE_LABELS[e.machineType] ?? e.machineType : e.source)} entry`}
              className="block w-40 sm:w-64 truncate text-left hover:text-gray-700 hover:underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              {note.summary}
            </button>
          ) : (
            "—"
          )}
        </td>
        <td className="px-6 py-3">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" onClick={() => openEdit(e)}>
              <Pencil className="h-4 w-4 text-gray-400" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(e.id)}>
              <Trash2 className="h-4 w-4 text-red-400" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div>
      <Header title="Revenue" description="Track coin vault collections and card payments">
        <div className="flex items-center gap-2">
          {isOwner && (
            <CollectQuartersDialog
              onSaved={() => {
                refreshEntries();
                refreshCash();
              }}
            />
          )}
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditingId(null); setEditingOriginalDate(null); setForm(emptyForm); } }}>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Add Entry
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Revenue Entry" : "Add Revenue Entry"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Amount ($)</Label>
                  <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COIN">Coin</SelectItem>
                    <SelectItem value="CARD">Card / Huebsch Pay</SelectItem>
                    <SelectItem value="VENDING">Vending</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Collected From</Label>
                <Select
                  value={form.machineId || (form.machineType ? `type:${form.machineType}` : "__none__")}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      machineId: v.startsWith("type:") || v === "__none__" ? "" : v,
                      machineType: v.startsWith("type:") ? v.slice(5) : "",
                    }))
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Not specified" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="type:WASHER">All washers</SelectItem>
                    <SelectItem value="type:DRYER">All dryers</SelectItem>
                    <SelectItem value="__none__">Not specified</SelectItem>
                    {machines.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400">
                  Counting a coin pull? Log washers and dryers separately — turns
                  per day can only count what it can tell apart.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Collected By</Label>
                <Input value={form.collectedBy} onChange={(e) => setForm((f) => ({ ...f, collectedBy: e.target.value }))} placeholder="Name" />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <Button type="submit" className="w-full">{editingId ? "Save Changes" : "Save Entry"}</Button>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </Header>

      <PageTabs tabs={[
        { label: "Revenue", href: "/dashboard/revenue" },
        { label: "Expenses", href: "/dashboard/expenses" },
        { label: "Utilities", href: "/dashboard/utilities" },
        { label: "Reports", href: "/dashboard/reports" },
      ]} />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-gray-500">Total (all time)</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(total)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-gray-500">Entries</p>
              <p className="text-2xl font-bold mt-1">{entries.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-gray-500">Average per entry</p>
              <p className="text-2xl font-bold mt-1">{entries.length ? formatCurrency(total / entries.length) : "—"}</p>
            </CardContent>
          </Card>
        </div>

        <CashOnHandCard isOwner={isOwner} refreshToken={cashRefreshToken} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              This Month — Daily Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="amount" fill="#16a34a" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">All Entries</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {entries.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No revenue entries yet.</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 text-xs">
                    <th className="text-left px-6 py-3">Date</th>
                    <th className="text-left px-6 py-3">Amount</th>
                    <th className="text-left px-6 py-3">Source</th>
                    <th className="text-left px-6 py-3">Machine</th>
                    <th className="text-left px-6 py-3">Collected By</th>
                    <th className="text-left px-6 py-3">Notes</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row) => {
                    if (row.kind === "single") {
                      return renderEntryRow(row.entry);
                    }

                    const expanded = expandedGroups.has(row.collectionId);
                    return (
                      <Fragment key={row.collectionId}>
                        <tr
                          className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                          onClick={() => toggleGroup(row.collectionId)}
                        >
                          <td className="px-6 py-3">
                            <span className="inline-flex items-center gap-1.5">
                              {expanded ? (
                                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                              )}
                              {formatDate(row.date)}
                            </span>
                          </td>
                          <td className="px-6 py-3 font-semibold text-green-600">{formatCurrency(row.total)}</td>
                          <td className="px-6 py-3">
                            <Badge variant="secondary">Collection</Badge>
                          </td>
                          <td className="px-6 py-3 text-gray-500">{row.sourceLabel}</td>
                          <td className="px-6 py-3 text-gray-500">{row.collectedBy ?? "—"}</td>
                          <td className="px-6 py-3 text-gray-400">
                            {row.entries.length} machine{row.entries.length === 1 ? "" : "s"}
                            {row.changerAmount != null && " · coin changer"}
                          </td>
                          <td className="px-6 py-3" />
                        </tr>
                        {expanded && row.entries.map((e) => renderEntryRow(e, true))}
                        {expanded && row.changerAmount != null && (
                          <tr key={`${row.collectionId}-changer`} className="border-b border-gray-50 bg-gray-50/60">
                            <td className="px-6 py-2 pl-12 text-gray-400 text-xs">{formatDate(row.date)}</td>
                            <td className="px-6 py-2 text-gray-500 text-xs">{formatCurrency(row.changerAmount)}</td>
                            <td className="px-6 py-2" colSpan={2}>
                              <span className="text-gray-400 text-xs">
                                Coin changer cash — not revenue, added to Cash on Hand
                              </span>
                            </td>
                            <td className="px-6 py-2" />
                            <td className="px-6 py-2" />
                            <td className="px-6 py-2" />
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!noteDetail} onOpenChange={(v) => !v && setNoteDetail(null)}>
        <DialogContent className="max-h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Entry Details</DialogTitle>
          </DialogHeader>
          {noteDetail && (
            <div className="overflow-y-auto flex-1 space-y-2 text-sm pr-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Date</span>
                <span>{formatDate(noteDetail.date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Amount</span>
                <span className="font-semibold text-green-600">{formatCurrency(noteDetail.amount)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Source</span>
                <Badge variant="secondary">{noteDetail.source}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Machine</span>
                <span>
                  {noteDetail.machine?.name ??
                    (noteDetail.machineType ? MACHINE_TYPE_LABELS[noteDetail.machineType] ?? noteDetail.machineType : "—")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Collected By</span>
                <span>{noteDetail.collectedBy ?? "—"}</span>
              </div>
              <div className="pt-2 border-t border-gray-100">
                <p className="text-gray-500 mb-1">Notes</p>
                <p className="whitespace-pre-wrap break-words text-gray-700">{noteDetail.notes}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
