import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { anthropicConfigured, describeAnthropicError } from "@/lib/anthropic";
import { manualScope } from "@/lib/manual-search";
import { askManuals } from "@/lib/manual-ask";

/** Answer a free-form question from the indexed manuals, citing pages. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!anthropicConfigured()) {
    return NextResponse.json({ error: "Asking questions needs ANTHROPIC_API_KEY set in Railway." }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as { question?: string; machineId?: string; manualId?: string } | null;
  const question = body?.question?.trim();
  if (!question) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  if (question.length > 2000) return NextResponse.json({ error: "Question is too long." }, { status: 400 });

  let machineLabel: string | null = null;
  if (body?.machineId) {
    const m = await prisma.machine.findUnique({
      where: { id: body.machineId },
      select: { name: true, type: true, brand: true, model: true },
    });
    if (m) machineLabel = [m.name, m.type.toLowerCase(), m.brand, m.model && `model ${m.model}`].filter(Boolean).join(", ");
  }

  try {
    const scope = await manualScope({ machineId: body?.machineId, manualId: body?.manualId });
    const result = await askManuals(question, scope, machineLabel);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[manuals/ask]", err);
    return NextResponse.json({ error: describeAnthropicError(err) }, { status: 502 });
  }
}
