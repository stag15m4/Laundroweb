"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Zap, Droplets, Flame, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

type UtilityBill = {
  id: string;
  type: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  dueDate: string | null;
  usageAmount: string;
  usageUnit: string;
  cost: string;
  provider: string | null;
  accountNumber: string | null;
  notes: string | null;
};

const utilityUnits: Record<string, string[]> = {
  ELECTRIC: ["kWh"],
  WATER: ["gal", "CCF", "HCF"],
  GAS: ["CCF", "MCF", "Therm"],
  SEWER: ["gal", "CCF"],
};

const typeIcons: Record<string, React.ElementType> = {
  ELECTRIC: Zap,
  WATER: Droplets,
  GAS: Flame,
  SEWER: Droplets,
};

const typeColors: Record<string, string> = {
  ELECTRIC: "text-yellow-600",
  WATER: "text-blue-500",
  GAS: "text-orange-500",
  SEWER: "text-gray-500",
};

const emptyForm = {
  type: "ELECTRIC", billingPeriodStart: "", billingPeriodEnd: "",
  dueDate: "", usageAmount: "", usageUnit: "kWh", cost: "",
  provider: "", accountNumber: "", notes: "",
};

export default function UtilitiesPage() {
  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    fetch("/api/utilities").then((r) => r.json()).then(setBills);
  }, []);

  const totals = bills.reduce(
    (acc, b) => {
      acc[b.type] = (acc[b.type] ?? 0) + Number(b.cost);
      return acc;
    },
    {} as Record<string, number>
  );

  const chartData = (() => {
    const byMonth: Record<string, Record<string, number>> = {};
    for (const b of bills) {
      const month = format(new Date(b.billingPeriodEnd), "MMM yy");
      if (!byMonth[month]) byMonth[month] = {};
      byMonth[month][b.type] = (byMonth[month][b.type] ?? 0) + Number(b.cost);
    }
    return Object.entries(byMonth)
      .slice(-12)
      .map(([month, data]) => ({ month, ...data }));
  })();

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/utilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const bill = await res.json();
      setBills((prev) => [bill, ...prev]);
      setOpen(false);
      setForm(emptyForm);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this bill?")) return;
    await fetch(`/api/utilities/${id}`, { method: "DELETE" });
    setBills((prev) => prev.filter((b) => b.id !== id));
  }

  return (
    <div>
      <Header title="Utilities" description="Electric, water, gas, and sewer bills with usage tracking">
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Bill
        </Button>
      </Header>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Utility Bill</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Utility Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v, usageUnit: utilityUnits[v][0] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ELECTRIC">Electric</SelectItem>
                  <SelectItem value="WATER">Water</SelectItem>
                  <SelectItem value="GAS">Gas</SelectItem>
                  <SelectItem value="SEWER">Sewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Input value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Billing Period Start</Label>
              <Input type="date" value={form.billingPeriodStart} onChange={(e) => setForm((f) => ({ ...f, billingPeriodStart: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Billing Period End</Label>
              <Input type="date" value={form.billingPeriodEnd} onChange={(e) => setForm((f) => ({ ...f, billingPeriodEnd: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Usage Amount</Label>
              <Input type="number" step="0.001" value={form.usageAmount} onChange={(e) => setForm((f) => ({ ...f, usageAmount: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Usage Unit</Label>
              <Select value={form.usageUnit} onValueChange={(v) => setForm((f) => ({ ...f, usageUnit: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(utilityUnits[form.type] ?? ["kWh"]).map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Total Cost ($)</Label>
              <Input type="number" step="0.01" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Account Number</Label>
              <Input value={form.accountNumber} onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Button type="submit" className="w-full">Save Bill</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {(["ELECTRIC", "WATER", "GAS", "SEWER"] as const).map((type) => {
            const Icon = typeIcons[type];
            return (
              <Card key={type}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`h-4 w-4 ${typeColors[type]}`} />
                    <span className="text-sm font-medium text-gray-600">{type}</span>
                  </div>
                  <p className="text-xl font-bold">{formatCurrency(totals[type] ?? 0)}</p>
                  <p className="text-xs text-gray-400">all time</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {chartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly Utility Costs</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                  <Bar dataKey="ELECTRIC" name="Electric" fill="#ca8a04" stackId="a" />
                  <Bar dataKey="WATER" name="Water" fill="#3b82f6" stackId="a" />
                  <Bar dataKey="GAS" name="Gas" fill="#f97316" stackId="a" />
                  <Bar dataKey="SEWER" name="Sewer" fill="#9ca3af" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bill History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {bills.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No bills recorded yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 text-xs">
                    <th className="text-left px-6 py-3">Type</th>
                    <th className="text-left px-6 py-3">Period</th>
                    <th className="text-left px-6 py-3">Usage</th>
                    <th className="text-left px-6 py-3">Cost</th>
                    <th className="text-left px-6 py-3">Due</th>
                    <th className="text-left px-6 py-3">Provider</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b) => {
                    const Icon = typeIcons[b.type] ?? Zap;
                    return (
                      <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-6 py-3">
                          <span className="flex items-center gap-1.5">
                            <Icon className={`h-3.5 w-3.5 ${typeColors[b.type]}`} />
                            <Badge variant="secondary">{b.type}</Badge>
                          </span>
                        </td>
                        <td className="px-6 py-3 text-gray-500">
                          {formatDate(b.billingPeriodStart)} – {formatDate(b.billingPeriodEnd)}
                        </td>
                        <td className="px-6 py-3">
                          {Number(b.usageAmount).toLocaleString()} {b.usageUnit}
                        </td>
                        <td className="px-6 py-3 font-semibold">{formatCurrency(b.cost)}</td>
                        <td className="px-6 py-3 text-gray-500">{b.dueDate ? formatDate(b.dueDate) : "—"}</td>
                        <td className="px-6 py-3 text-gray-500">{b.provider ?? "—"}</td>
                        <td className="px-6 py-3">
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(b.id)}>
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
