import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { lookupEntries, manualScope } from "@/lib/manual-search";

/** Exact code and keyword lookup across indexed manuals. Database only -- no AI. */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const scope = await manualScope({
    machineId: searchParams.get("machineId"),
    manualId: searchParams.get("manualId"),
  });
  return NextResponse.json(await lookupEntries(q, scope));
}
