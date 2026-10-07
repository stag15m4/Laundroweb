import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fascardConfigured, fascardGet, fascardLocationId } from "@/lib/fascard";

// GET /api/fascard/test — owner-only. Confirms the configured credentials
// can actually authenticate against FasCard, without assuming anything
// about what data endpoints look like.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!fascardConfigured()) {
    return NextResponse.json(
      { ok: false, error: "FASCARD_USERNAME, FASCARD_PASSWORD, or FASCARD_LOCATION_ID is not set." },
      { status: 503 }
    );
  }

  try {
    // Locations is listed in CCI's docs as a basic read endpoint, and
    // doesn't require guessing at any other endpoint's request shape.
    const result = await fascardGet(`/api/Locations/${fascardLocationId()}`);
    return NextResponse.json({ ok: true, locationId: fascardLocationId(), result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}
