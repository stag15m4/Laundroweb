"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  DollarSign,
  Wrench,
  Zap,
  ShoppingBag,
  Building2,
  AlertTriangle,
  BookOpen,
  Users,
  Camera,
  BarChart3,
  Receipt,
  LogOut,
  WashingMachine,
  ChevronRight,
  Settings,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ownerNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/revenue", label: "Revenue", icon: DollarSign },
  { href: "/dashboard/equipment", label: "Equipment", icon: WashingMachine },
  { href: "/dashboard/floor-plan", label: "Floor Plan", icon: LayoutGrid },
  { href: "/dashboard/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/dashboard/utilities", label: "Utilities", icon: Zap },
  { href: "/dashboard/vending", label: "Vending", icon: ShoppingBag },
  { href: "/dashboard/expenses", label: "Expenses", icon: Receipt },
  { href: "/dashboard/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/dashboard/contacts", label: "Contacts", icon: Users },
  { href: "/dashboard/notes", label: "Notes", icon: BookOpen },
  { href: "/dashboard/cameras", label: "Cameras", icon: Camera },
  { href: "/dashboard/reports", label: "Reports", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const staffNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/dashboard/notes", label: "Notes", icon: BookOpen },
  { href: "/dashboard/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const nav = role === "OWNER" ? ownerNav : staffNav;

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-gray-200 bg-gray-950 text-white">
      <div className="flex h-16 items-center gap-2 px-5 border-b border-gray-800">
        <WashingMachine className="h-6 w-6 text-blue-400" />
        <span className="font-bold text-lg tracking-tight">Laundroweb</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
              {active && <ChevronRight className="ml-auto h-3 w-3" />}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-800 p-3">
        <div className="mb-2 px-3 py-1">
          <p className="text-xs font-medium text-gray-300">{session?.user?.name}</p>
          <p className="text-xs text-gray-500">{role}</p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
