"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { Plus, Pencil, AlertTriangle, Package, RotateCcw } from "lucide-react";

type Part = {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  minimumStock: number;
  costPerUnit: string | null;
  notes: string | null;
  _count: { usages: number };
};

const UNITS = ["ea", "pair", "box", "set", "roll", "ft"];
const CATEGORIES = [
  "general",
  "bearings",
  "belts",
  "seals",
  "filters",
  "electrical",
  "plumbing",
  "hvac",
  "other",
];

const emptyForm = {
  name: "",
  category: "general",
  unit: "ea",
  quantity: "0",
  minimumStock: "1",
  costPerUnit: "",
  notes: "",
};

export default function PartsPage() {
  const { data: session } = useSession();
  const isOwner = (session?.user as { role?: string })?.role === "OWNER";

  const [parts, setParts] = useState<Part[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Part | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [restockTarget, setRestockTarget] = useState<Part | null>(null);
  const [restockQty, setRestockQty] = useState("1");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/parts")
      .then((r) => r.json())
      .then(setParts);
  }, []);

  function openAdd() {
    setEditTarget(null);
    setForm(emptyForm);
    setAddOpen(true);
  }

  function openEdit(p: Part) {
    setEditTarget(p);
    setForm({
      name: p.name,
      category: p.category,
      unit: p.unit,
      quantity: String(p.quantity),
      minimumStock: String(p.minimumStock),
      costPerUnit: p.costPerUnit ?? "",
      notes: p.notes ?? "",
    });
    setAddOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editTarget) {
      const res = await fetch(`/api/parts/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          unit: form.unit,
          minimumStock: form.minimumStock,
          costPerUnit: form.costPerUnit || null,
          notes: form.notes || null,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setParts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      }
    } else {
      const res = await fetch("/api/parts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          unit: form.unit,
          quantity: form.quantity,
          minimumStock: form.minimumStock,
          costPerUnit: form.costPerUnit || null,
          notes: form.notes || null,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setParts((prev) => [...prev, created].sort((a, b) =>
          a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
        ));
      }
    }
    setAddOpen(false);
  }

  async function handleRestock(e: React.FormEvent) {
    e.preventDefault();
    if (!restockTarget) return;
    const res = await fetch("/api/parts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _action: "restock", id: restockTarget.id, quantity: restockQty }),
    });
    if (res.ok) {
      const updated = await res.json();
      setParts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, quantity: updated.quantity } : p)));
    }
    setRestockTarget(null);
    setRestockQty("1");
  }

  async function handleDelete(p: Part) {
    setDeleteError(null);
    const res = await fetch(`/api/parts/${p.id}`, { method: "DELETE" });
    if (res.ok) {
      setParts((prev) => prev.filter((x) => x.id !== p.id));
    } else {
      const data = await res.json();
      setDeleteError(data.error ?? "Could not delete part.");
    }
  }

  // Group by category
  const grouped: Record<string, Part[]> = {};
  for (const p of parts) {
    (grouped[p.category] ??= []).push(p);
  }

  const lowStockCount = parts.filter((p) => p.quantity < p.minimumStock).length;

  return (
    <div>
      <Header title="Parts Inventory" description="Spare parts on hand for maintenance">
        {isOwner && (
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Add Part
          </Button>
        )}
      </Header>

      {/* Add / Edit dialog */}
      {isOwner && (
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editTarget ? "Edit Part" : "Add Part"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="p-name">Name</Label>
                <Input
                  id="p-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Drum Bearing"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Select
                  value={form.unit}
                  onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!editTarget && (
                <div className="space-y-1.5">
                  <Label htmlFor="p-qty">Starting Quantity</Label>
                  <Input
                    id="p-qty"
                    type="number"
                    min="0"
                    value={form.quantity}
                    onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="p-min">Minimum Stock</Label>
                <Input
                  id="p-min"
                  type="number"
                  min="0"
                  value={form.minimumStock}
                  onChange={(e) => setForm((f) => ({ ...f, minimumStock: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-cost">Cost per Unit ($)</Label>
                <Input
                  id="p-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.costPerUnit}
                  onChange={(e) => setForm((f) => ({ ...f, costPerUnit: e.target.value }))}
                  placeholder="optional"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="p-notes">Notes</Label>
                <Input
                  id="p-notes"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Part number, supplier, etc."
                />
              </div>
              <div className="col-span-2 flex items-center justify-between">
                <div>
                  {editTarget && editTarget._count.usages === 0 && (
                    <button
                      type="button"
                      onClick={() => handleDelete(editTarget)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Delete part
                    </button>
                  )}
                  {deleteError && (
                    <p className="text-xs text-red-500">{deleteError}</p>
                  )}
                </div>
                <Button type="submit">{editTarget ? "Save Changes" : "Add Part"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Restock dialog */}
      <Dialog
        open={restockTarget !== null}
        onOpenChange={(v) => { if (!v) setRestockTarget(null); }}
      >
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Restock — {restockTarget?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRestock} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="r-qty">Quantity to Add</Label>
              <Input
                id="r-qty"
                type="number"
                min="1"
                value={restockQty}
                onChange={(e) => setRestockQty(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full">
              Add to Stock
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="p-6 space-y-6">
        {/* Low stock alert */}
        {lowStockCount > 0 && (
          <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {lowStockCount} part{lowStockCount !== 1 ? "s" : ""} below minimum stock.
          </div>
        )}

        {parts.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-12">
            No parts yet.{isOwner ? " Add your first spare part above." : ""}
          </p>
        )}

        {Object.entries(grouped).map(([category, list]) => (
          <div key={category}>
            <h2 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3 capitalize">
              {category}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {list.map((p) => {
                const isLow = p.quantity < p.minimumStock;
                const isBacklog = p.quantity < 0;
                return (
                  <Card
                    key={p.id}
                    className={
                      isBacklog
                        ? "border-red-300"
                        : isLow
                        ? "border-yellow-300"
                        : ""
                    }
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <p className="text-sm font-semibold">{p.name}</p>
                        </div>
                        {isOwner && (
                          <button
                            onClick={() => openEdit(p)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="space-y-1 text-sm mb-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-2xl font-bold tabular-nums ${
                              isBacklog
                                ? "text-red-600"
                                : isLow
                                ? "text-yellow-600"
                                : "text-gray-900"
                            }`}
                          >
                            {p.quantity}
                          </span>
                          <span className="text-xs text-gray-400">{p.unit}</span>
                          {isBacklog && (
                            <span className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                              backlog
                            </span>
                          )}
                          {!isBacklog && isLow && (
                            <span className="text-xs font-medium text-yellow-700 bg-yellow-50 border border-yellow-200 px-1.5 py-0.5 rounded">
                              low
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">
                          Min: {p.minimumStock} {p.unit}
                        </p>
                        {p.costPerUnit && (
                          <p className="text-xs text-gray-500">
                            {formatCurrency(Number(p.costPerUnit))} / {p.unit}
                          </p>
                        )}
                        {p.notes && (
                          <p className="text-xs text-gray-400 italic">{p.notes}</p>
                        )}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setRestockTarget(p);
                          setRestockQty("1");
                        }}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                        Restock
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
