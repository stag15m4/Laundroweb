"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Zap, BarChart3 } from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";

type RevenueEntry = { date: string; amount: string; source: string };
type UtilityBill = { type: string; billingPeriodEnd: string; cost: string; usageAmount: string; usageUnit: string };
type Expense = { date: string; amount: string; category: string };

export default function ReportsPage() {
  const [revenue, setRevenue] = useState<RevenueEntry[]>([]);
  const [utilities, setUtilities] = useState<UtilityBill[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [months, setMonths] = useState(6);

  useEffect(() => {
    Promise.all([
      fetch("/api/revenue").then((r) => r.json()),
      fetch("/api/utilities").then((r) => r.json()),
      fetch("/api/expenses").then((r) => r.json()),
    ]).then(([rev, util, exp]) => {
      setRevenue(rev);
      setUtilities(util);
      setExpenses(exp);
    });
  }, []);

  const monthLabels = Array.from({ length: months }, (_, i) => {
    const d = subMonths(new Date(), months - 1 - i);
    return format(d, "MMM yy");
  });

  const monthlyData = monthLabels.map((label, i) => {
    const d = subMonths(new Date(), months - 1 - i);
    const start = startOfMonth(d);
    const end = endOfMonth(d);

    const monthRevenue = revenue
      .filter((r) => new Date(r.date) >= start && new Date(r.date) <= end)
      .reduce((s, r) => s + Number(r.amount), 0);

    const monthUtilities = utilities
      .filter((u) => new Date(u.billingPeriodEnd) >= start && new Date(u.billingPeriodEnd) <= end)
      .reduce((s, u) => s + Number(u.cost), 0);

    const monthExpenses = expenses
      .filter((e) => new Date(e.date) >= start && new Date(e.date) <= end)
      .reduce((s, e) => s + Number(e.amount), 0);

    const totalCosts = monthUtilities + monthExpenses;
    const netProfit = monthRevenue - totalCosts;

    return { month: label, Revenue: monthRevenue, "Utilities + Expenses": totalCosts, "Net Profit": netProfit };
  });

  const totalRevenue = revenue.reduce((s, r) => s + Number(r.amount), 0);
  const totalUtilities = utilities.reduce((s, u) => s + Number(u.cost), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const netProfit = totalRevenue - totalUtilities - totalExpenses;

  const electricBills = utilities.filter((u) => u.type === "ELECTRIC");
  const avgKwh = electricBills.length
    ? electricBills.reduce((s, b) => s + Number(b.usageAmount), 0) / electricBills.length
    : 0;
  const avgElectricCost = electricBills.length
    ? electricBills.reduce((s, b) => s + Number(b.cost), 0) / electricBills.length
    : 0;

  return (
    <div>
      <Header title="Reports" description="Financial summary and trend analysis">
        <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Last 3 months</SelectItem>
            <SelectItem value="6">Last 6 months</SelectItem>
            <SelectItem value="12">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      </Header>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <p className="text-sm text-gray-500">Total Revenue</p>
              </div>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalRevenue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="h-4 w-4 text-red-500" />
                <p className="text-sm text-gray-500">Total Costs</p>
              </div>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(totalUtilities + totalExpenses)}</p>
              <p className="text-xs text-gray-400">Utilities + Expenses</p>
            </CardContent>
          </Card>
          <Card className={netProfit >= 0 ? "border-green-200" : "border-red-200"}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-blue-600" />
                <p className="text-sm text-gray-500">Net Profit</p>
              </div>
              <p className={`text-2xl font-bold ${netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(netProfit)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="h-4 w-4 text-yellow-500" />
                <p className="text-sm text-gray-500">Avg Electric</p>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(avgElectricCost)}</p>
              <p className="text-xs text-gray-400">{avgKwh.toFixed(0)} kWh / month</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Revenue vs. Costs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                <Bar dataKey="Revenue" fill="#16a34a" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Utilities + Expenses" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Net Profit Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Line
                  type="monotone"
                  dataKey="Net Profit"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Utility Cost Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {(["ELECTRIC", "WATER", "GAS", "SEWER"] as const).map((type) => {
                const typeBills = utilities.filter((u) => u.type === type);
                const total = typeBills.reduce((s, b) => s + Number(b.cost), 0);
                if (!total) return null;
                const pct = ((total / totalUtilities) * 100).toFixed(0);
                return (
                  <div key={type} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{type}</span>
                      <span className="text-xs text-gray-400">{pct}%</span>
                    </div>
                    <span className="text-sm font-semibold">{formatCurrency(total)}</span>
                  </div>
                );
              })}
              {totalUtilities === 0 && <p className="text-sm text-gray-400 py-4 text-center">No utility data.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Expense Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.entries(
                expenses.reduce((acc, e) => {
                  acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount);
                  return acc;
                }, {} as Record<string, number>)
              )
                .sort((a, b) => b[1] - a[1])
                .map(([cat, total]) => {
                  const pct = totalExpenses > 0 ? ((total / totalExpenses) * 100).toFixed(0) : "0";
                  return (
                    <div key={cat} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{cat}</span>
                        <span className="text-xs text-gray-400">{pct}%</span>
                      </div>
                      <span className="text-sm font-semibold">{formatCurrency(total)}</span>
                    </div>
                  );
                })}
              {totalExpenses === 0 && <p className="text-sm text-gray-400 py-4 text-center">No expense data.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
