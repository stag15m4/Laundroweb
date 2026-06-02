import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DollarSign, WashingMachine, AlertTriangle, Zap, TrendingUp, Wrench, ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { startOfMonth, endOfMonth } from "date-fns";

async function getDashboardData() {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [monthRevenue, machineCount, outOfOrderCount, pendingMaintenance, recentRevenue, recentMaintenance, allProducts, latestUtility] =
    await Promise.all([
      prisma.revenueEntry.aggregate({
        where: { date: { gte: monthStart, lte: monthEnd } },
        _sum: { amount: true },
      }),
      prisma.machine.count({ where: { status: { not: "RETIRED" } } }),
      prisma.machine.count({ where: { status: "OUT_OF_ORDER" } }),
      prisma.maintenanceLog.count({ where: { status: { in: ["SCHEDULED", "OVERDUE"] } } }),
      prisma.revenueEntry.findMany({
        take: 5,
        orderBy: { date: "desc" },
        include: { machine: { select: { name: true } } },
      }),
      prisma.maintenanceLog.findMany({
        take: 5,
        orderBy: { date: "desc" },
        include: { machine: { select: { name: true } } },
      }),
      prisma.vendingProduct.findMany({ where: { active: true } }),
      prisma.utilityBill.findFirst({ orderBy: { billingPeriodEnd: "desc" } }),
    ]);

  const lowStockProducts = allProducts.filter((p) => p.currentStock <= p.minimumStock);

  return {
    monthRevenue: Number(monthRevenue._sum.amount ?? 0),
    machineCount,
    outOfOrderCount,
    pendingMaintenance,
    recentRevenue,
    recentMaintenance,
    lowStockProducts,
    latestUtility,
  };
}

function StatCard({
  title,
  value,
  icon: Icon,
  sub,
  accent,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  sub?: string;
  accent?: "blue" | "green" | "red" | "yellow";
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    red: "bg-red-50 text-red-600",
    yellow: "bg-yellow-50 text-yellow-700",
  };
  const color = colors[accent ?? "blue"];
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">{title}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          <div className={`rounded-xl p-3 ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const data = await getDashboardData();
  const isOwner = (session?.user as { role?: string })?.role === "OWNER";

  return (
    <div>
      <Header
        title={`Welcome back, ${session?.user?.name}`}
        description={new Date().toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      />
      <div className="p-6 space-y-6">
        {isOwner && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Revenue This Month"
              value={formatCurrency(data.monthRevenue)}
              icon={DollarSign}
              accent="green"
            />
            <StatCard
              title="Active Machines"
              value={`${data.machineCount - data.outOfOrderCount} / ${data.machineCount}`}
              icon={WashingMachine}
              sub={data.outOfOrderCount > 0 ? `${data.outOfOrderCount} out of order` : "All operational"}
              accent={data.outOfOrderCount > 0 ? "red" : "blue"}
            />
            <StatCard
              title="Pending Maintenance"
              value={String(data.pendingMaintenance)}
              icon={Wrench}
              accent={data.pendingMaintenance > 0 ? "yellow" : "blue"}
            />
            <StatCard
              title="Last Utility Bill"
              value={data.latestUtility ? formatCurrency(Number(data.latestUtility.cost)) : "—"}
              icon={Zap}
              sub={data.latestUtility ? data.latestUtility.type : "No bills recorded"}
              accent="blue"
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {isOwner && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  Recent Revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.recentRevenue.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">No revenue entries yet.</p>
                ) : (
                  <div className="space-y-2">
                    {data.recentRevenue.map((r) => (
                      <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                        <div>
                          <p className="text-sm font-medium">{r.machine?.name ?? r.source}</p>
                          <p className="text-xs text-gray-400">{formatDate(r.date)}</p>
                        </div>
                        <span className="text-sm font-semibold text-green-600">{formatCurrency(Number(r.amount))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="h-4 w-4 text-blue-600" />
                Recent Maintenance
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.recentMaintenance.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No maintenance logs yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.recentMaintenance.map((m) => (
                    <div key={m.id} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                      <div>
                        <p className="text-sm font-medium">
                          {m.machine?.name ?? "Building"} — {m.type}
                        </p>
                        <p className="text-xs text-gray-400">{formatDate(m.date)}</p>
                      </div>
                      <Badge
                        variant={
                          m.status === "COMPLETED" ? "success" : m.status === "OVERDUE" ? "destructive" : "warning"
                        }
                      >
                        {m.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {isOwner && data.lowStockProducts.length > 0 && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-yellow-800">
                  <ShoppingBag className="h-4 w-4" />
                  Low Vending Stock
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.lowStockProducts.map((p) => (
                    <div key={p.id} className="flex items-center justify-between">
                      <p className="text-sm text-yellow-900">{p.name}</p>
                      <Badge variant="warning">{p.currentStock} left</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {data.outOfOrderCount > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-red-800">
                  <AlertTriangle className="h-4 w-4" />
                  Machines Out of Order
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-red-700">
                  {data.outOfOrderCount} machine(s) currently out of order. Check the Equipment page.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
