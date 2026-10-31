import type { Metadata } from "next";
import { RefundRequestForm } from "@/components/refund/RefundRequestForm";

export const metadata: Metadata = {
  title: "Request a Refund — Laundroweb",
  description: "Request a refund or reimbursement for a machine that didn't work.",
};

export default function RefundPage() {
  return <RefundRequestForm />;
}
