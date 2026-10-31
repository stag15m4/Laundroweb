"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { Undo2 } from "lucide-react";

type RefundRequest = {
  id: string;
  machineLabel: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  customerAddress: string;
  issueDate: string;
  description: string;
  transactionAmount: string;
  amountRequested: string;
  status: "PENDING" | "APPROVED" | "DENIED" | "RESOLVED";
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

const STATUS_TABS = ["ALL", "PENDING", "APPROVED", "DENIED", "RESOLVED"] as const;

const STATUS_BADGE: Record<RefundRequest["status"], "warning" | "success" | "destructive" | "secondary"> = {
  PENDING: "warning",
  APPROVED: "success",
  DENIED: "destructive",
  RESOLVED: "secondary",
};

export default function RefundsPage() {
  const { data: session } = useSession();
  const isOwner = (session?.user as { role?: string } | undefined)?.role === "OWNER";

  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]>("PENDING");
  const [loading, setLoading] = useState(true);

  const [reviewTarget, setReviewTarget] = useState<RefundRequest | null>(null);
  const [reviewStatus, setReviewStatus] = useState<RefundRequest["status"]>("APPROVED");
  const [reviewNotes, setReviewNotes] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    fetch("/api/refund-requests")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setRequests(d))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () => (tab === "ALL" ? requests : requests.filter((r) => r.status === tab)),
    [requests, tab]
  );

  function openReview(request: RefundRequest) {
    setReviewTarget(request);
    setReviewStatus(request.status === "PENDING" ? "APPROVED" : request.status);
    setReviewNotes(request.reviewNotes ?? "");
  }

  async function handleReview(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewTarget) return;
    setSaving(true);
    const res = await fetch(`/api/refund-requests/${reviewTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: reviewStatus, reviewNotes: reviewNotes || null }),
    });
    setSaving(false);
    if (res.ok) {
      const updated = await res.json();
      setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setReviewTarget(null);
    }
  }

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  return (
    <div>
      <Header
        title="Refund Requests"
        description="Customer-submitted requests for a refund or reimbursement, from clintonlaundryworks.com"
      />
      <div className="p-6 space-y-4">
        <div className="flex gap-2 flex-wrap">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => setTab(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                tab === s
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
              {s === "PENDING" && pendingCount > 0 && (
                <span className="ml-1.5 text-xs opacity-80">({pendingCount})</span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-gray-400">
              <Undo2 className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              No requests here.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-4 flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{r.customerName}</span>
                      <Badge variant={STATUS_BADGE[r.status]}>{r.status}</Badge>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Unit {r.machineLabel} · {formatDateTime(r.issueDate)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatCurrency(r.transactionAmount)} paid into machine ·{" "}
                      <span className="font-medium text-gray-700">
                        {formatCurrency(r.amountRequested)} requested
                      </span>
                    </p>
                    <p className="text-sm text-gray-700 mt-1.5">{r.description}</p>
                    <p className="text-xs text-gray-400 mt-1.5">
                      {[r.customerPhone, r.customerEmail].filter(Boolean).join(" · ")}
                    </p>
                    <p className="text-xs text-gray-400">{r.customerAddress}</p>
                    {r.reviewNotes && (
                      <p className="text-xs text-gray-400 mt-1.5 italic">
                        Review: {r.reviewNotes}
                        {r.reviewedBy && ` — ${r.reviewedBy}`}
                      </p>
                    )}
                  </div>
                  {isOwner && (
                    <Button variant="outline" size="sm" onClick={() => openReview(r)} className="flex-shrink-0">
                      Review
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!reviewTarget} onOpenChange={(open) => !open && setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Refund Request</DialogTitle>
          </DialogHeader>
          {reviewTarget && (
            <form onSubmit={handleReview} className="space-y-4">
              <div className="text-sm text-gray-600 space-y-1">
                <p>
                  <span className="font-semibold text-gray-900">{reviewTarget.customerName}</span> · Unit{" "}
                  {reviewTarget.machineLabel} · {formatDateTime(reviewTarget.issueDate)}
                </p>
                <p>
                  {formatCurrency(reviewTarget.transactionAmount)} paid ·{" "}
                  <span className="font-medium text-gray-900">
                    {formatCurrency(reviewTarget.amountRequested)} requested
                  </span>
                </p>
                <p>{reviewTarget.description}</p>
                <p className="text-xs text-gray-400">
                  {[reviewTarget.customerPhone, reviewTarget.customerEmail].filter(Boolean).join(" · ")}
                  {" · "}
                  {reviewTarget.customerAddress}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Decision</Label>
                <Select value={reviewStatus} onValueChange={(v) => setReviewStatus(v as RefundRequest["status"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="APPROVED">Approved</SelectItem>
                    <SelectItem value="DENIED">Denied</SelectItem>
                    <SelectItem value="RESOLVED">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Saving…" : "Save Decision"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
