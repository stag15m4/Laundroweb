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
import { Plus, Receipt, Trash2, Pencil, Repeat, Pause, Play } from "lucide-react";
import { format } from "date-fns";
import { nextDueDate } from "@/lib/recurring-frequency";

type Expense = {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: string;
  vendor: string | null;
  notes: string | null;
  recurringExpenseId: string | null;
};

type Frequency = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

type RecurringExpense = {
  id: string;
  category: string;
  description: string;
  amount: string;
  vendor: string | null;
  notes: string | null;
  frequency: Frequency;
  startDate: string;
  active: boolean;
  lastGeneratedDate: string | null;
};

const categories = [
  "Supplies", "Repairs", "Labor", "Insurance", "Rent / Lease",
  "Marketing", "Software", "Professional Services", "Refunds", "Vending Resupply", "Miscellaneous",
];

const FREQUENCY_LABELS: Record<Frequency, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

const emptyRecurringForm = {
  category: "Rent / Lease",
  description: "",
  amount: "",
  vendor: "",
  notes: "",
  frequency: "MONTHLY" as Frequency,
  startDate: format(new Date(), "yyyy-MM-dd"),
};

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

  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [recurringForm, setRecurringForm] = useState(emptyRecurringForm);
  const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null);
  const [savingRecurring, setSavingRecurring] = useState(false);

  function openAddRecurring() {
    setEditingRecurring(null);
    setRecurringForm(emptyRecurringForm);
    setRecurringOpen(true);
  }

  function openEditRecurring(template: RecurringExpense) {
    setEditingRecurring(template);
    setRecurringForm({
      category: template.category,
      description: template.description,
      amount: String(template.amount),
      vendor: template.vendor ?? "",
      notes: template.notes ?? "",
      frequency: template.frequency,
      startDate: toDateInput(template.startDate),
    });
    setRecurringOpen(true);
  }

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

  function refreshExpenses() {
    return fetch("/api/expenses").then((r) => r.json()).then(setExpenses);
  }
  function refreshRecurring() {
    return fetch("/api/recurring-expenses").then((r) => r.json()).then((d) => Array.isArray(d) && setRecurring(d));
  }

  useEffect(() => {
    // GET /api/expenses generates any recurring expenses that have come
    // due server-side before it responds, so awaiting it before fetching
    // the templates means lastGeneratedDate is already current by the time
    // refreshRecurring runs -- firing both at once would race, and could
    // show a template's "next due" from before its own catch-up ran.
    refreshExpenses().then(refreshRecurring);
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

  async function handleSubmitRecurring(e: React.FormEvent) {
    e.preventDefault();
    setSavingRecurring(true);
    try {
      const res = await fetch(
        editingRecurring ? `/api/recurring-expenses/${editingRecurring.id}` : "/api/recurring-expenses",
        {
          method: editingRecurring ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(recurringForm),
        }
      );
      if (!res.ok) return;
      const template = await res.json();
      setRecurring((prev) =>
        editingRecurring ? prev.map((x) => (x.id === template.id ? template : x)) : [template, ...prev]
      );
      setRecurringOpen(false);
      setEditingRecurring(null);
      setRecurringForm(emptyRecurringForm);
      // A new (or resumed) template whose start date is already in the
      // past has catching up to do -- GET /api/expenses is what actually
      // generates it, so re-fetch now instead of waiting for a reload.
      // refreshRecurring must wait for that to finish (not fire alongside
      // it), or it can win the race and show "next due" from before this
      // template's own catch-up ran.
      refreshExpenses().then(refreshRecurring);
    } finally {
      setSavingRecurring(false);
    }
  }

  async function handleDeleteRecurring(id: string) {
    if (!confirm("Delete this recurring expense? Expenses it already generated are kept.")) return;
    await fetch(`/api/recurring-expenses/${id}`, { method: "DELETE" });
    setRecurring((prev) => prev.filter((t) => t.id !== id));
  }

  async function toggleRecurringActive(template: RecurringExpense) {
    const res = await fetch(`/api/recurring-expenses/${template.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !template.active }),
    });
    if (!res.ok) return;
    const updated = await res.json();
    setRecurring((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    if (updated.active) {
      refreshExpenses().then(refreshRecurring);
    }
  }

  return (
    <div>
      <Header title="Expenses" description="Track all business costs and spending">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={openAddRecurring}>
            <Repeat className="h-4 w-4 mr-2" />
            Add Recurring
          </Button>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Add Expense
          </Button>
        </div>
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

      <Dialog open={recurringOpen} onOpenChange={setRecurringOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRecurring ? "Edit Recurring Expense" : "Add Recurring Expense"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitRecurring} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={recurringForm.category}
                  onValueChange={(v) => setRecurringForm((f) => ({ ...f, category: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={recurringForm.amount}
                  onChange={(e) => setRecurringForm((f) => ({ ...f, amount: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select
                  value={recurringForm.frequency}
                  onValueChange={(v) => setRecurringForm((f) => ({ ...f, frequency: v as Frequency }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((f) => (
                      <SelectItem key={f} value={f}>{FREQUENCY_LABELS[f]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{editingRecurring ? "Start Date" : "First Occurrence"}</Label>
                <Input
                  type="date"
                  value={recurringForm.startDate}
                  onChange={(e) => setRecurringForm((f) => ({ ...f, startDate: e.target.value }))}
                  required
                />
                {editingRecurring && (
                  <p className="text-xs text-gray-400">
                    Only affects scheduling before the first expense this template has already generated.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Vendor</Label>
                <Input value={recurringForm.vendor} onChange={(e) => setRecurringForm((f) => ({ ...f, vendor: e.target.value }))} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Description</Label>
                <Input
                  value={recurringForm.description}
                  onChange={(e) => setRecurringForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Monthly rent"
                  required
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Notes</Label>
                <Input value={recurringForm.notes} onChange={(e) => setRecurringForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={savingRecurring}>
              {savingRecurring ? "Saving…" : editingRecurring ? "Save Changes" : "Save Recurring Expense"}
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
              <Repeat className="h-4 w-4" />
              Recurring Expenses
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recurring.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">
                No recurring expenses set up yet -- rent, pest control, insurance, anything on a fixed schedule.
              </p>
            ) : (
              <div className="divide-y divide-gray-50">
                {recurring.map((t) => (
                  <div key={t.id} className="flex items-center justify-between px-6 py-3 gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary">{t.category}</Badge>
                        <span className="text-sm font-medium truncate">{t.description}</span>
                        {!t.active && <Badge variant="outline">Paused</Badge>}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {FREQUENCY_LABELS[t.frequency]} · next {formatDate(nextDueDate(t))}
                        {t.vendor && ` · ${t.vendor}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-semibold text-red-600">{formatCurrency(t.amount)}</span>
                      <Button variant="ghost" size="icon" onClick={() => toggleRecurringActive(t)} title={t.active ? "Pause" : "Resume"}>
                        {t.active ? <Pause className="h-4 w-4 text-gray-400" /> : <Play className="h-4 w-4 text-gray-400" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEditRecurring(t)} title="Edit">
                        <Pencil className="h-4 w-4 text-gray-400" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteRecurring(t.id)} title="Delete">
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <Badge variant="secondary">{e.category}</Badge>
                          {e.recurringExpenseId && <Repeat className="h-3.5 w-3.5 text-gray-300" aria-label="Auto-generated from a recurring expense" />}
                        </span>
                      </td>
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
