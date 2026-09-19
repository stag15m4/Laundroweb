"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { PageTabs } from "@/components/layout/PageTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Receipt, Trash2, Pencil } from "lucide-react";
import { format } from "date-fns";

type Expense = {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: string;
  vendor: string | null;
  notes: string | null;
};

const categories = [
  "Supplies", "Repairs", "Labor", "Insurance", "Rent / Lease",
  "Marketing", "Software", "Professional Services", "Miscellaneous",
];

const emptyForm = { date: format(new Date(), "yyyy-MM-dd"), category: "Supplies", description: "", amount: "", vendor: "", notes: "" };

/** Prisma returns a timestamp; <input type="date"> wants a bare yyyy-MM-dd. */
function toDateInput(iso: string): string {
  return iso ? iso.slice(0, 10) : "";
}

/**
 * A new expense in a given category usually goes to the same vendor as the
 * last one, so that is filled in from the most recent expense in that
 * category. Amount and description always differ, so they stay blank.
 */
function carryForward(category: string, expenses: Expense[]) {
  const previous = expenses
    .filter((e) => e.category === category)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  return {
    ...emptyForm,
    date: format(new Date(), "yyyy-MM-dd"),
    category,
    vendor: previous?.vendor ?? "",
  };
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [saving, setSaving] = useState(false);

  function openAdd() {
    setEditing(null);
    setForm(carryForward(emptyForm.category, expenses));
    setOpen(true);
  }

  function openEdit(expense: Expense) {
    setEditing(expense);
    setForm({
      date: toDateInput(expense.date),
      category: expense.category,
      description: expense.description,
      amount: String(expense.amount),
      vendor: expense.vendor ?? "",
      notes: expense.notes ?? "",
    });
    setOpen(true);
  }

  useEffect(() => {
    fetch("/api/expenses").then((r) => r.json()).then(setExpenses);
  }, []);

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);

  const byCategory = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount);
    return acc;
  }, {} as Record<string, number>);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(
        editing ? `/api/expenses/${editing.id}` : "/api/expenses",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      if (!res.ok) return;
      const expense = await res.json();
      setExpenses((prev) =>
        editing ? prev.map((x) => (x.id === expense.id ? expense : x)) : [expense, ...prev]
      );
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this expense?")) return;
    await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div>
      <Header title="Expenses" description="Track all business costs and spending">
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Add Expense
        </Button>
      </Header>

      <PageTabs tabs={[
        { label: "Revenue", href: "/dashboard/revenue" },
        { label: "Expenses", href: "/dashboard/expenses" },
        { label: "Utilities", href: "/dashboard/utilities" },
        { label: "Reports", href: "/dashboard/reports" },
      ]} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Expense" : "Add Expense"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Amount ($)</Label>
                <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) =>
                    setForm((f) =>
                      editing
                        ? { ...f, category: v }
                        : { ...carryForward(v, expenses), date: f.date, amount: f.amount, description: f.description, notes: f.notes }
                    )
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Vendor</Label>
                <Input value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} required />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Save Expense"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Total (all time)</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(total)}</p>
            </CardContent>
          </Card>
          {Object.entries(byCategory)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([cat, amt]) => (
              <Card key={cat}>
                <CardContent className="p-4">
                  <p className="text-sm text-gray-500">{cat}</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(amt)}</p>
                </CardContent>
              </Card>
            ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              All Expenses
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {expenses.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No expenses yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 text-xs">
                    <th className="text-left px-6 py-3">Date</th>
                    <th className="text-left px-6 py-3">Category</th>
                    <th className="text-left px-6 py-3">Description</th>
                    <th className="text-left px-6 py-3">Vendor</th>
                    <th className="text-left px-6 py-3">Amount</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-6 py-3 whitespace-nowrap">{formatDate(e.date)}</td>
                      <td className="px-6 py-3"><Badge variant="secondary">{e.category}</Badge></td>
                      <td className="px-6 py-3">{e.description}</td>
                      <td className="px-6 py-3 text-gray-500">{e.vendor ?? "—"}</td>
                      <td className="px-6 py-3 font-semibold text-red-600">{formatCurrency(e.amount)}</td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(e)} title="Edit expense">
                            <Pencil className="h-4 w-4 text-gray-400" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(e.id)} title="Delete expense">
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </Button>
                        </div>
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
