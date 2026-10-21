
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { wdfActor, respond } from "@/lib/wdf-server";
import { WdfError } from "@/lib/wdf-pricing";
import { agreementPdf } from "@/lib/agreement-pdf";
import { contentDisposition } from "@/lib/content-disposition";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await wdfActor();
    const { id } = await params;
    const a = await prisma.wdfServiceAgreement.findUnique({ where: { id } });
    if (!a) throw new WdfError("Agreement not found.", 404);
    const signed = req.nextUrl.searchParams.get("kind") === "signed";
    const bytes = signed ? a.signedFileData : a.issuedPdf ?? await agreementPdf(a.documentText, a.number, a.version, "DRAFT", a.documentSha);
    if (!bytes) throw new WdfError("No signed copy has been uploaded.", 404);
    const filename = "CLW-Agreement-" + a.number + "-v" + a.version + (signed ? "-signed" : a.issuedAt ? "-issued" : "-DRAFT") + ".pdf";
    return new NextResponse(new Uint8Array(bytes), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": contentDisposition(req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline", filename),
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (e) { return respond(async () => { throw e; }); }
}
