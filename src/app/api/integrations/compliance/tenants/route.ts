import { NextRequest, NextResponse } from "next/server";
import { verifyComplianceToken } from "@/lib/compliance-auth";
export async function GET(req: NextRequest) {
  if (!verifyComplianceToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ businesses: [{ id: "laundroweb", name: "Clinton Laundry Works" }] }, { headers: { "Cache-Control": "no-store" } });
}
