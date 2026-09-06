"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  DollarSign,
  ShoppingBag,
  AlertTriangle,
  BookOpen,
  Users,
  Camera,
  LogOut,
  WashingMachine,
  ChevronRight,
  Settings,
  LayoutGrid,
  Thermometer,
} from "lucide-react";
import { cn } from "@/lib/utils";

const EQUIPMENT_PATHS = ["/dashboard/equipment", "/dashboard/parts", "/dashboard/maintenance"];
const FINANCE_PATHS = ["/dashboard/revenue", "/dashboard/expenses", "/dashboard/utilities", "/dashboard/reports"];

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activePaths?: string[];
};

const ownerNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/equipment", label: "Equipment", icon: LayoutGrid, activePaths: EQUIPMENT_PATHS },
  { href: "/dashboard/revenue", label: "Finance", icon: DollarSign, activePaths: FINANCE_PATHS },
  { href: "/dashboard/vending", label: "Vending", icon: ShoppingBag },
  { href: "/dashboard/climate", label: "Climate", icon: Thermometer },
  { href: "/dashboard/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/dashboard/contacts", label: "Contacts", icon: Users },
  { href: "/dashboard/notes", label: "Notes", icon: BookOpen },
  { href: "/dashboard/cameras", label: "Cameras", icon: Camera },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const staffNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/equipment", label: "Equipment", icon: LayoutGrid, activePaths: EQUIPMENT_PATHS },
  { href: "/dashboard/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/dashboard/notes", label: "Notes", icon: BookOpen },
  { href: "/dashboard/climate", label: "Climate", icon: Thermometer },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const nav = role === "OWNER" ? ownerNav : staffNav;

  return (
    <aside className="flex h-full w-60 flex-col border-r border-gray-200 bg-gray-950 text-white">
      <div className="flex h-16 items-center gap-2 px-5 border-b border-gray-800 flex-shrink-0">
        <WashingMachine className="h-6 w-6 text-blue-400" />
        <span className="font-bold text-lg tracking-tight">Laundroweb</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {nav.map(({ href, label, icon: Icon, activePaths }) => {
          const paths = activePaths ?? [href];
          const active = paths.some((p) =>
            p === "/dashboard" ? pathname === p : pathname === p || pathname.startsWith(p + "/")
          );
          return (
            <Link
              key={href}
              href={href}
              onClick={() => onClose?.()}
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
