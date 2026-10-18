import { NextRequest, NextResponse } from "next/server";
import { verifyAlfredToken, alfredUnauthorized } from "@/lib/alfred-auth";
import { alfredError } from "@/lib/alfred-write";
import { anthropicConfigured, describeAnthropicError } from "@/lib/anthropic";
import { askManuals } from "@/lib/manual-ask";
import { alfredScope } from "../scope";

/**
 * Answer a question from the manual pages themselves, with every statement
 * cited to its page. This is a read: it changes nothing. It calls Claude
 * twice, so allow it up to a minute.
 */
export async function GET(req: NextRequest) {
  if (!verifyAlfredToken(req)) return alfredUnauthorized();

  const params = req.nextUrl.searchParams;
  const q = params.get("q")?.trim();
  if (!q) return alfredError(400, "missing_query", "Send q: the question to answer from the manuals.");
  if (q.length > 2000) return alfredError(400, "query_too_long", "That question is too long. Keep it under 2,000 characters.");
  if (!anthropicConfigured()) {
    return alfredError(503, "search_not_configured", "Manual search isn't switched on in Laundroweb yet (no Anthropic API key is set).");
  }

  const resolved = await alfredScope(params);
  if (!resolved.ok) return resolved.response;

  try {
    const result = await askManuals(q, resolved.scope, resolved.label);
    if (!result.ok) return alfredError(404, "not_in_manuals", result.message);

    // One string with each cited claim followed by its source, so the answer
    // can be relayed as-is; the structured citations come alongside.
    const answer = result.segments
      .map((s) => {
        const pages = [...new Set(s.citations.map((c) => `${c.manualName} p.${c.page}${c.endPage !== c.page ? `-${c.endPage}` : ""}`))];
        return s.text + (pages.length ? ` [${pages.join("; ")}]` : "");
      })
      .join("");
    return NextResponse.json({
      message: "Answered from the manuals.",
      answer,
      citations: result.segments.flatMap((s) => s.citations),
      pagesRead: result.consulted,
    });
  } catch (err) {
    console.error("[alfred/manuals/ask]", err);
    return alfredError(502, "search_failed", describeAnthropicError(err));
  }
}
