import { NextRequest, NextResponse } from "next/server";
import { verifyAlfredToken, alfredUnauthorized } from "@/lib/alfred-auth";
import { alfredError } from "@/lib/alfred-write";
import { lookupEntries } from "@/lib/manual-search";
import { alfredScope } from "../scope";

/**
 * Exact lookup of error codes, procedures, settings and specs indexed from the
 * manuals. Database only -- no AI, so it is instant and returns what the
 * manual prints, word for word.
 */
export async function GET(req: NextRequest) {
  if (!verifyAlfredToken(req)) return alfredUnauthorized();

  const params = req.nextUrl.searchParams;
  const q = params.get("q")?.trim();
  if (!q) return alfredError(400, "missing_query", "Send q: an error code like E35, or a few words like \"vend price\".");

  const resolved = await alfredScope(params);
  if (!resolved.ok) return resolved.response;

  const results = (await lookupEntries(q, resolved.scope)).map(({ codeKey: _key, manual, ...e }) => ({
    ...e,
    manualId: manual.id,
    manualName: manual.name,
  }));
  const where = resolved.label ? ` in the manuals for ${resolved.label}` : "";
  return NextResponse.json({
    message: results.length
      ? `${results.length} match${results.length === 1 ? "" : "es"} for "${q}"${where}.`
      : `Nothing indexed matches "${q}"${where}. Try laundromat_ask_manuals for a full-text answer.`,
    results,
  });
}
