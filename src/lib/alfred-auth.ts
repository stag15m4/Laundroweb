import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export function verifyAlfredToken(req: NextRequest): boolean {
  const secret = process.env.ALFRED_SERVICE_TOKEN;
  if (!secret) return false;
  const header = req.headers.get("x-alfred-token") ?? "";
  // HMAC normalises length so timingSafeEqual never sees unequal-length buffers
  const mac = (s: string) => createHmac("sha256", "alfred").update(s).digest();
  try {
    return timingSafeEqual(mac(header), mac(secret));
  } catch {
    return false;
  }
}

export function alfredUnauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
