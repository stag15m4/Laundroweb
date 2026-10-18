import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
export function verifyComplianceToken(req: NextRequest) {
  const secret = process.env.COMPLIANCE_SERVICE_TOKEN;
  if (!secret) return false;
  const header = req.headers.get("x-compliance-token") ?? "";
  const mac = (s: string) => createHmac("sha256", "compliance").update(s).digest();
  return header.length > 0 && timingSafeEqual(mac(header), mac(secret));
}
export async function complianceOwner(req?: NextRequest): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string }).role !== "OWNER") return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  if (req && req.headers.get("origin") !== new URL(process.env.NEXTAUTH_URL || req.url).origin) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  return null;
}
