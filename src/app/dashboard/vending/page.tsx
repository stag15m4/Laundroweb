"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Plus, ShoppingBag, Package, RefreshCw, AlertTriangle, LayoutGrid, ChevronLeft, ChevronRight, X } from "lucide-react";
import { format } from "date-fns";

// ── Types ──────────────────────────────────────────────────────────────────────

type Product = {
  id: string;
  name: string;
  category: string;
  price: string;
  costPerUnit: string | null;
  currentStock: number;
  minimumStock: number;
  active: boolean;
  _count: { sales: number; restocks: number };
};

type VendingMachine = {
  id: string;
  name: string;
  status: string;
};

type SlotProduct = {
  id: string;
  name: string;
  price: string;
  costPerUnit: string | null;
  currentStock: number;
  minimumStock: number;
  category: string;
};

type Slot = {
  id: string;
  machineId: string;
  slotCode: string;
  productId: string | null;
  product: SlotProduct | null;
  capacity: number;
};

const categories = ["Detergent", "Softener", "Bleach", "Snacks", "Drinks", "Supplies", "Other"];
const emptyProduct = { name: "", category: "Detergent", price: "", costPerUnit: "", currentStock: "0", minimumStock: "5" };

// ── Planogram helpers ──────────────────────────────────────────────────────────

function rowLabels(rows: number) {
  return Array.from({ length: rows }, (_, i) => String.fromCharCode(65 + i)); // A, B, C…
}

function slotColor(slot: Slot | undefined) {
  if (!slot?.product) return "bg-gray-100 border-dashed border-gray-300 text-gray-400";
  const pct = slot.product.currentStock / Math.max(slot.capacity, 1);
  const isLow = slot.product.currentStock <= slot.product.minimumStock;
  if (isLow) return "bg-yellow-50 border-yellow-300 text-yellow-800";
  if (pct >= 0.5) return "bg-green-50 border-green-300 text-green-800";
  return "bg-orange-50 border-orange-300 text-orange-800";
}

// ── PlanogramGrid ──────────────────────────────────────────────────────────────

function PlanogramGrid({
  machineId,
  products,
  isOwner,
}: {
  machineId: string;
  products: Product[];
  isOwner: boolean;
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(8);
  const [gridLoaded, setGridLoaded] = useState(false);
  const [editSlot, setEditSlot] = useState<{ code: string; slot?: Slot } | null>(null);
  const [editForm, setEditForm] = useState({ productId: "", capacity: "10" });
  const [saving, setSaving] = useState(false);

  const fetchSlots = useCallback(() => {
    fetch(`/api/vending/planogram?machineId=${machineId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSlots(data);
      });
  }, [machineId]);

  // Load persisted grid dimensions for this machine
  useEffect(() => {
    setGridLoaded(false);
    fetch(`/api/settings?prefix=planogram_${machineId}_`)
      .then((r) => r.json())
      .then((settings: { key: string; value: string }[]) => {
        if (Array.isArray(settings)) {
          const r = settings.find((s) => s.key === `planogram_${machineId}_rows`);
          const c = settings.find((s) => s.key === `planogram_${machineId}_cols`);
          if (r) setRows(Number(r.value));
          if (c) setCols(Number(c.value));
        }
        setGridLoaded(true);
      });
  }, [machineId]);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  function saveGridSize(newRows: number, newCols: number) {
    fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: `planogram_${machineId}_rows`, value: newRows }),
    });
    fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: `planogram_${machineId}_cols`, value: newCols }),
    });
  }

  const slotMap = new Map(slots.map((s) => [s.slotCode, s]));

  function openEdit(code: string) {
    if (!isOwner) return;
    const existing = slotMap.get(code);
    setEditSlot({ code, slot: existing });
    setEditForm({
      productId: existing?.productId ?? "",
      capacity: String(existing?.capacity ?? 10),
    });
  }

  async function saveSlot(e: React.FormEvent) {
    e.preventDefault();
    if (!editSlot) return;
    setSaving(true);
    const res = await fetch("/api/vending/planogram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        machineId,
        slotCode: editSlot.code,
        productId: editForm.productId || null,
        capacity: Number(editForm.capacity) || 10,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setSlots((prev) => {
        const idx = prev.findIndex((s) => s.slotCode === editSlot.code);
        return idx >= 0 ? prev.map((s, i) => (i === idx ? updated : s)) : [...prev, updated];
      });
      setEditSlot(null);
    }
    setSaving(false);
  }

  async function clearSlot() {
    if (!editSlot) return;
    setSaving(true);
    await fetch(`/api/vending/planogram?machineId=${machineId}&slotCode=${editSlot.code}`, {
      method: "DELETE",
    });
    setSlots((prev) => prev.filter((s) => s.slotCode !== editSlot.code));
    setEditSlot(null);
    setSaving(false);
  }

  const rowLetters = rowLabels(rows);

  if (!gridLoaded) return <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>;

  return (
    <div className="space-y-4">
      {/* Grid size controls */}
      <div className="flex items-center gap-6 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <span className="font-medium">Rows</span>
          <button
            onClick={() => { const v = Math.max(1, rows - 1); setRows(v); saveGridSize(v, cols); }}
            className="p-0.5 rounded hover:bg-gray-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="w-5 text-center font-mono">{rows}</span>
          <button
            onClick={() => { const v = Math.min(10, rows + 1); setRows(v); saveGridSize(v, cols); }}
            className="p-0.5 rounded hover:bg-gray-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium">Columns</span>
          <button
            onClick={() => { const v = Math.max(1, cols - 1); setCols(v); saveGridSize(rows, v); }}
            className="p-0.5 rounded hover:bg-gray-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="w-5 text-center font-mono">{cols}</span>
          <button
            onClick={() => { const v = Math.min(12, cols + 1); setCols(v); saveGridSize(rows, v); }}
            className="p-0.5 rounded hover:bg-gray-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <span className="text-gray-400 text-xs">{rows * cols} slots total</span>
        {isOwner && (
          <span className="text-xs text-gray-400 ml-auto">Click any slot to assign a product</span>
        )}
      </div>

      {/* Column header row */}
      <div className="overflow-x-auto">
        <div
          className="grid gap-1.5 min-w-max"
          style={{ gridTemplateColumns: `2rem repeat(${cols}, minmax(80px, 1fr))` }}
        >
          {/* top-left corner */}
          <div />
          {Array.from({ length: cols }, (_, c) => (
            <div key={c} className="text-center text-xs font-bold text-gray-400 pb-0.5">
              {c + 1}
            </div>
          ))}

          {rowLetters.map((row) => (
            <>
              {/* Row label */}
              <div key={`lbl-${row}`} className="flex items-center justify-center text-xs font-bold text-gray-400">
                {row}
              </div>
              {Array.from({ length: cols }, (_, c) => {
                const code = `${row}${c + 1}`;
                const slot = slotMap.get(code);
                const colorClass = slotColor(slot);
                return (
                  <button
                    key={code}
                    onClick={() => openEdit(code)}
                    disabled={!isOwner}
                    className={`border rounded-lg p-1.5 text-left transition-shadow hover:shadow-md ${colorClass} ${isOwner ? "cursor-pointer" : "cursor-default"}`}
                    style={{ minHeight: "64px" }}
                  >
                    <div className="text-xs font-bold opacity-60 mb-0.5">{code}</div>
                    {slot?.product ? (
                      <>
                        <div className="text-xs font-semibold leading-tight truncate">{slot.product.name}</div>
                        <div className="text-xs opacity-75">{formatCurrency(slot.product.price)}</div>
                        <div className="text-xs opacity-60">{slot.product.currentStock}/{slot.capacity}</div>
                      </>
                    ) : (
                      <div className="text-xs opacity-40 mt-1">Empty</div>
                    )}
                  </button>
                );
              })}
            </>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500 pt-1">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-green-100 border border-green-300 inline-block" /> Stocked
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-orange-100 border border-orange-300 inline-block" /> Getting low
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-300 inline-block" /> Below minimum
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-gray-100 border border-gray-300 inline-block" /> Empty slot
        </span>
      </div>

      {/* Slot edit dialog */}
      <Dialog open={!!editSlot} onOpenChange={(v) => { if (!v) setEditSlot(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Slot {editSlot?.code}</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveSlot} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Product</Label>
              <Select
                value={editForm.productId}
                onValueChange={(v) => setEditForm((f) => ({ ...f, productId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="— Empty slot —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Empty slot —</SelectItem>
                  {products
                    .filter((p) => p.active)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — {formatCurrency(p.price)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slot-cap">Slot Capacity</Label>
              <Input
                id="slot-cap"
                type="number"
                min="1"
                max="50"
                value={editForm.capacity}
                onChange={(e) => setEditForm((f) => ({ ...f, capacity: e.target.value }))}
              />
            </div>
            {editForm.productId && (() => {
              const p = products.find((p) => p.id === editForm.productId);
              return p ? (
                <div className="text-xs text-gray-500 bg-gray-50 rounded p-2 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Price</span><span className="font-medium">{formatCurrency(p.price)}</span>
                  </div>
                  {p.costPerUnit && (
                    <div className="flex justify-between">
                      <span>Cost</span><span>{formatCurrency(p.costPerUnit)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Current stock</span><span>{p.currentStock}</span>
                  </div>
                </div>
              ) : null;
            })()}
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save Slot"}
              </Button>
              {editSlot?.slot?.productId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-700"
                  disabled={saving}
                  onClick={clearSlot}
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── VendingPage ────────────────────────────────────────────────────────────────

export default function VendingPage() {
  const { data: session } = useSession();
  const isOwner = (session?.user as { role?: string })?.role === "OWNER";

  const [tab, setTab] = useState<"products" | "planogram">("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [vendingMachines, setVendingMachines] = useState<VendingMachine[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>("");

  const [addOpen, setAddOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [restockOpen, setRestockOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const [txForm, setTxForm] = useState({ productId: "", quantity: "1", cost: "", supplier: "", date: format(new Date(), "yyyy-MM-dd") });

  useEffect(() => {
    fetch("/api/vending").then((r) => r.json()).then(setProducts);
    fetch("/api/equipment")
      .then((r) => r.json())
      .then((machines: VendingMachine[] & { type: string }[]) => {
        const vending = (machines as (VendingMachine & { type: string })[]).filter((m) => m.type === "VENDING");
        setVendingMachines(vending);
        if (vending.length > 0) setSelectedMachineId(vending[0].id);
      });
  }, []);

  const lowStock = products.filter((p) => p.active && p.currentStock <= p.minimumStock);

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/vending", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const p = await res.json();
      setProducts((prev) => [...prev, { ...p, _count: { sales: 0, restocks: 0 } }]);
      setAddOpen(false);
      setForm(emptyProduct);
    }
  }

  async function handleSale(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/vending", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _action: "sale", productId: txForm.productId, quantity: Number(txForm.quantity), date: txForm.date }),
    });
    if (res.ok) {
      const refreshed = await fetch("/api/vending").then((r) => r.json());
      setProducts(refreshed);
      setSaleOpen(false);
    }
  }

  async function handleRestock(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/vending", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _action: "restock", productId: txForm.productId, quantity: Number(txForm.quantity), cost: txForm.cost || null, supplier: txForm.supplier, date: txForm.date }),
    });
    if (res.ok) {
      const refreshed = await fetch("/api/vending").then((r) => r.json());
      setProducts(refreshed);
      setRestockOpen(false);
    }
  }

  function openSale(p: Product) {
    setSelectedProduct(p);
    setTxForm((f) => ({ ...f, productId: p.id, quantity: "1" }));
    setSaleOpen(true);
  }

  function openRestock(p: Product) {
    setSelectedProduct(p);
    setTxForm((f) => ({ ...f, productId: p.id, quantity: "10" }));
    setRestockOpen(true);
  }

  return (
    <div>
      <Header title="Vending" description="Laundry supplies, vending inventory, and machine planograms">
        {tab === "products" && (
          <>
            <Button variant="outline" onClick={() => { setTxForm((f) => ({ ...f, productId: products[0]?.id ?? "" })); setRestockOpen(true); }}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Restock
            </Button>
            <Button variant="outline" onClick={() => { setTxForm((f) => ({ ...f, productId: products[0]?.id ?? "" })); setSaleOpen(true); }}>
              <ShoppingBag className="h-4 w-4 mr-2" />
              Log Sale
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </>
        )}
      </Header>

      {/* Tab bar */}
      <div className="border-b border-gray-200 bg-white px-6">
        <div className="flex gap-0">
          {[
            { key: "products", label: "Products", icon: ShoppingBag },
            { key: "planogram", label: "Planogram", icon: LayoutGrid },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as "products" | "planogram")}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Products tab ── */}
      {tab === "products" && (
        <div className="p-6 space-y-6">
          {lowStock.length > 0 && (
            <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {lowStock.map((p) => p.name).join(", ")} — low stock
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {products.filter((p) => p.active).map((p) => {
              const margin = p.costPerUnit
                ? (((Number(p.price) - Number(p.costPerUnit)) / Number(p.price)) * 100).toFixed(0)
                : null;
              const isLow = p.currentStock <= p.minimumStock;
              return (
                <Card key={p.id} className={isLow ? "border-yellow-200" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-sm">{p.name}</p>
                        <Badge variant="secondary" className="mt-1 text-xs">{p.category}</Badge>
                      </div>
                      <p className="text-lg font-bold text-green-600">{formatCurrency(p.price)}</p>
                    </div>
                    <div className="space-y-1 text-xs text-gray-500 mb-3">
                      <div className="flex justify-between">
                        <span>Stock</span>
                        <span className={isLow ? "font-bold text-yellow-600" : "font-medium text-gray-700"}>
                          {p.currentStock} / {p.minimumStock} min
                        </span>
                      </div>
                      {p.costPerUnit && (
                        <div className="flex justify-between">
                          <span>Cost / unit</span>
                          <span>{formatCurrency(p.costPerUnit)}</span>
                        </div>
                      )}
                      {margin && (
                        <div className="flex justify-between">
                          <span>Margin</span>
                          <span className="text-green-600">{margin}%</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Total sales</span>
                        <span>{p._count.sales}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => openSale(p)}>
                        <ShoppingBag className="h-3 w-3 mr-1" />
                        Sell
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => openRestock(p)}>
                        <Package className="h-3 w-3 mr-1" />
                        Restock
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {products.filter((p) => p.active).length === 0 && (
            <p className="text-sm text-gray-400 text-center py-12">No vending products yet.</p>
          )}
        </div>
      )}

      {/* ── Planogram tab ── */}
      {tab === "planogram" && (
        <div className="p-6 space-y-4">
          {vendingMachines.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">
              No vending machines found. Add a machine with type "Vending Machine" in Equipment first.
            </p>
          ) : (
            <>
              {/* Machine selector */}
              {vendingMachines.length > 1 && (
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700">Machine</span>
                  <Select value={selectedMachineId} onValueChange={setSelectedMachineId}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {vendingMachines.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {vendingMachines.length === 1 && (
                <p className="text-sm font-medium text-gray-700">
                  {vendingMachines[0].name}
                </p>
              )}

              {selectedMachineId && (
                <PlanogramGrid
                  key={selectedMachineId}
                  machineId={selectedMachineId}
                  products={products}
                  isOwner={isOwner}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* ── Dialogs ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Vending Product</DialogTitle></DialogHeader>
          <form onSubmit={handleAddProduct} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Product Name</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sell Price ($)</Label>
                <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Cost per Unit ($)</Label>
                <Input type="number" step="0.01" value={form.costPerUnit} onChange={(e) => setForm((f) => ({ ...f, costPerUnit: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Initial Stock</Label>
                <Input type="number" value={form.currentStock} onChange={(e) => setForm((f) => ({ ...f, currentStock: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Minimum Stock Alert</Label>
                <Input type="number" value={form.minimumStock} onChange={(e) => setForm((f) => ({ ...f, minimumStock: e.target.value }))} />
              </div>
            </div>
            <Button type="submit" className="w-full">Add Product</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={saleOpen} onOpenChange={setSaleOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log Sale{selectedProduct ? ` — ${selectedProduct.name}` : ""}</DialogTitle></DialogHeader>
          <form onSubmit={handleSale} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Product</Label>
              <Select value={txForm.productId} onValueChange={(v) => { setTxForm((f) => ({ ...f, productId: v })); setSelectedProduct(products.find((p) => p.id === v) ?? null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{products.filter((p) => p.active).map((p) => <SelectItem key={p.id} value={p.id}>{p.name} (stock: {p.currentStock})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input type="number" min="1" value={txForm.quantity} onChange={(e) => setTxForm((f) => ({ ...f, quantity: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={txForm.date} onChange={(e) => setTxForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
            </div>
            {selectedProduct && (
              <p className="text-sm text-gray-500">Revenue: {formatCurrency(Number(selectedProduct.price) * Number(txForm.quantity || 0))}</p>
            )}
            <Button type="submit" className="w-full">Log Sale</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={restockOpen} onOpenChange={setRestockOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Restock{selectedProduct ? ` — ${selectedProduct.name}` : ""}</DialogTitle></DialogHeader>
          <form onSubmit={handleRestock} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Product</Label>
              <Select value={txForm.productId} onValueChange={(v) => { setTxForm((f) => ({ ...f, productId: v })); setSelectedProduct(products.find((p) => p.id === v) ?? null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{products.filter((p) => p.active).map((p) => <SelectItem key={p.id} value={p.id}>{p.name} (stock: {p.currentStock})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantity Added</Label>
                <Input type="number" min="1" value={txForm.quantity} onChange={(e) => setTxForm((f) => ({ ...f, quantity: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Total Cost ($)</Label>
                <Input type="number" step="0.01" value={txForm.cost} onChange={(e) => setTxForm((f) => ({ ...f, cost: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <Input value={txForm.supplier} onChange={(e) => setTxForm((f) => ({ ...f, supplier: e.target.value }))} placeholder="Sam's Club, etc." />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={txForm.date} onChange={(e) => setTxForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
            </div>
            <Button type="submit" className="w-full">Save Restock</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
