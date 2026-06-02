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
import { formatCurrency } from "@/lib/utils";
import { Plus, ShoppingBag, Package, RefreshCw, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

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

const categories = ["Detergent", "Softener", "Bleach", "Snacks", "Drinks", "Supplies", "Other"];

const emptyProduct = { name: "", category: "Detergent", price: "", costPerUnit: "", currentStock: "0", minimumStock: "5" };

export default function VendingPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [restockOpen, setRestockOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const [txForm, setTxForm] = useState({ productId: "", quantity: "1", cost: "", supplier: "", date: format(new Date(), "yyyy-MM-dd") });

  useEffect(() => {
    fetch("/api/vending").then((r) => r.json()).then(setProducts);
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
      <Header title="Vending" description="Laundry supplies and vending machine inventory">
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
      </Header>

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

      <div className="p-6 space-y-6">
        {lowStock.length > 0 && (
          <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {lowStock.map((p) => p.name).join(", ")} — low stock
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.filter((p) => p.active).map((p) => {
            const margin = p.costPerUnit ? ((Number(p.price) - Number(p.costPerUnit)) / Number(p.price) * 100).toFixed(0) : null;
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
                      <span className={isLow ? "font-bold text-yellow-600" : "font-medium text-gray-700"}>{p.currentStock} / {p.minimumStock} min</span>
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
    </div>
  );
}
