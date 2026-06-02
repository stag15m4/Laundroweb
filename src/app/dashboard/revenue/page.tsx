"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Trash2, DollarSign } from "lucide-react";
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
};

type Machine = { id: string; name: string; type: string };

export default function RevenuePage() {
  const [entries, setEntries] = useState<RevenueEntry[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    amount: "",
    source: "COIN",
    machineId: "",
    notes: "",
    collectedBy: "",
  });

  useEffect(() => {
    fetch("/api/revenue").then((r) => r.json()).then(setEntries);
    fetch("/api/equipment").then((r) => r.json()).then(setMachines);
  }, []);

  const total = entries.reduce((s, e) => s + Number(e.amount), 0);

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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/revenue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const entry = await res.json();
      setEntries((prev) => [entry, ...prev]);
      setOpen(false);
      setForm({ date: format(new Date(), "yyyy-MM-dd"), amount: "", source: "COIN", machineId: "", notes: "", collectedBy: "" });
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this entry?")) return;
    await fetch(`/api/revenue/${id}`, { method: "DELETE" });
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div>
      <Header title="Revenue" description="Track coin vault collections and card payments">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Entry
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Revenue Entry</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
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
                <Label>Machine (optional)</Label>
                <Select value={form.machineId} onValueChange={(v) => setForm((f) => ({ ...f, machineId: v }))}>
                  <SelectTrigger><SelectValue placeholder="All machines / total" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All machines / total</SelectItem>
                    {machines.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Collected By</Label>
                <Input value={form.collectedBy} onChange={(e) => setForm((f) => ({ ...f, collectedBy: e.target.value }))} placeholder="Name" />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <Button type="submit" className="w-full">Save Entry</Button>
            </form>
          </DialogContent>
        </Dialog>
      </Header>

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
              <table className="w-full text-sm">
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
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-6 py-3">{formatDate(e.date)}</td>
                      <td className="px-6 py-3 font-semibold text-green-600">{formatCurrency(e.amount)}</td>
                      <td className="px-6 py-3"><Badge variant="secondary">{e.source}</Badge></td>
                      <td className="px-6 py-3 text-gray-500">{e.machine?.name ?? "—"}</td>
                      <td className="px-6 py-3 text-gray-500">{e.collectedBy ?? "—"}</td>
                      <td className="px-6 py-3 text-gray-400">{e.notes ?? "—"}</td>
                      <td className="px-6 py-3">
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(e.id)}>
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
