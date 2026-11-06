"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Phone, AlertTriangle, ChevronRight } from "lucide-react";

type Summary = { unreadCount: number; openUrgent: number };
type Snapshot = { userId: string; data: Summary | null; error: boolean };
const Context = createContext<{ data: Summary | null; error: boolean }>({ data: null, error: false });

export function PhoneNotificationProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id || "";
  const [snapshot, setSnapshot] = useState<Snapshot>({ userId: "", data: null, error: false });
  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    let active = true;
    let revision = 0;
    const controllers = new Set<AbortController>();
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      const request = ++revision;
      const controller = new AbortController();
      controllers.add(controller);
      try {
        const response = await fetch("/api/phone/notifications", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Notification status unavailable.");
        const data = await response.json() as Summary;
        if (![data.unreadCount, data.openUrgent].every(n => Number.isInteger(n) && n >= 0)) throw new Error("Invalid notification status.");
        if (active && request === revision) setSnapshot({ userId, data, error: false });
      } catch {
        if (active && request === revision) setSnapshot(previous => ({ userId, data: previous.userId === userId ? previous.data : null, error: true }));
      } finally { controllers.delete(controller); }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    const changed = () => void refresh();
    window.addEventListener("phone-inbox-changed", changed);
    window.addEventListener("focus", changed);
    document.addEventListener("visibilitychange", changed);
    return () => {
      active = false; clearInterval(timer); controllers.forEach(controller => controller.abort());
      window.removeEventListener("phone-inbox-changed", changed);
      window.removeEventListener("focus", changed);
      document.removeEventListener("visibilitychange", changed);
    };
  }, [userId, status]);
  const current = status === "authenticated" && snapshot.userId === userId ? snapshot : { data: null, error: false };
  return <Context.Provider value={current}>{children}</Context.Provider>;
}

export function PhoneUnreadBadge() {
  const { data, error } = useContext(Context);
  if (!data && !error) return null;
  if (error) return <span className="rounded-full bg-gray-500 px-1.5 text-xs font-bold text-white" title="Phone notification status unavailable" aria-label="Phone notification status unavailable">?</span>;
  if (!data || (!data.unreadCount && !data.openUrgent)) return null;
  const label = `${data.unreadCount} unread phone messages${data.openUrgent ? `; ${data.openUrgent} urgent alerts awaiting acknowledgment` : ""}`;
  return <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white" title={label} aria-label={label} role="status">
    {data.unreadCount ? data.unreadCount > 99 ? "99+" : data.unreadCount : "!"}
  </span>;
}

export function PhoneDashboardNotice() {
  const { data, error } = useContext(Context);
  if (!data && !error) return null;
  const urgent = !!data?.openUrgent;
  return <Link href="/dashboard/phone" className={`flex items-center gap-4 rounded-xl border bg-white p-5 shadow-sm ${urgent ? "border-red-300" : "border-gray-200"}`}>
    <div className={`rounded-xl p-3 ${urgent ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
      {urgent ? <AlertTriangle className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
    </div>
    <div className="min-w-0 flex-1">
      <p className="font-semibold text-gray-900">Phone messages <span className="ml-2 inline-block align-middle"><PhoneUnreadBadge /></span></p>
      <p className="text-sm text-gray-600">{error ? "Message status unavailable. Open the inbox to check." : data?.unreadCount ? `${data.unreadCount} new ${data.unreadCount === 1 ? "message" : "messages"} to review` : "No unread messages"}</p>
      {urgent && <p className="mt-1 text-sm font-medium text-red-700">{data!.openUrgent} urgent {data!.openUrgent === 1 ? "alert needs" : "alerts need"} acknowledgment</p>}
    </div>
    <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
  </Link>;
}
