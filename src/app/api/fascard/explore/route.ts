import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fascardConfigured, fascardGet, fascardPost } from "@/lib/fascard";

// POST /api/fascard/explore — owner-only. Proxies one authenticated call to
// an arbitrary FasCard API path so real endpoint shapes can be discovered
// against the live account, instead of guessing at undocumented responses.
// { path: "/api/Transactions", method?: "GET" | "POST", body?: unknown }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!fascardConfigured()) {
    return NextResponse.json({ error: "FasCard is not configured" }, { status: 503 });
  }

  const { path, method, body } = await req.json();
  if (typeof path !== "string" || !path.startsWith("/")) {
    return NextResponse.json({ error: "path must be a string starting with /" }, { status: 400 });
  }

  try {
    const result =
      method === "POST" ? await fascardPost(path, body ?? {}) : await fascardGet(path);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}
