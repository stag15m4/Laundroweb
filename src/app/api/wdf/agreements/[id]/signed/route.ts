
import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { wdfActor, assertWdfOrigin, respond } from "@/lib/wdf-server";
import { WdfError } from "@/lib/wdf-pricing";
import { civilDate } from "@/lib/service-agreement";
export const dynamic = "force-dynamic";
const MAX = 10 * 1024 * 1024;
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await wdfActor();
    if (user.role !== "OWNER") throw new WdfError("Only an owner can record a signed agreement.", 403);
    assertWdfOrigin(req);
    if (!req.headers.get("content-type")?.includes("multipart/form-data")) throw new WdfError("Upload the signed PDF using the form.", 415);
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > MAX + 65536) throw new WdfError("Signed PDF must be 10 MB or smaller.", 413);
    const form = await req.formData(), file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new WdfError("Choose a signed PDF.");
    if (file.size > MAX) throw new WdfError("Signed PDF must be 10 MB or smaller.", 413);
    if (form.get("attested") !== "true") throw new WdfError("Confirm both authorized signatures and that the signed copy matches the issued agreement.");
    const providerSignedDate = civilDate(form.get("providerSignedDate"), "Provider signature date");
    const customerSignedDate = civilDate(form.get("customerSignedDate"), "Customer signature date");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    if (providerSignedDate > today || customerSignedDate > today) throw new WdfError("Signature dates cannot be in the future.");
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new WdfError("The uploaded file is not a PDF.");
    let pages = 0;
    try { const pdf = await PDFDocument.load(bytes); pages = pdf.getPageCount(); } catch { throw new WdfError("Upload a readable, unencrypted PDF."); }
    if (!pages) throw new WdfError("The PDF is empty.");
    const sha = createHash("sha256").update(bytes).digest("hex");
    const { id } = await params;
    try {
      await prisma.$transaction(async tx => {
        const a = await tx.wdfServiceAgreement.findUnique({ where: { id }, include: { plan: { select: { customerId: true } } } });
        if (!a) throw new WdfError("Agreement not found.", 404);
        if (a.status === "SIGNED" && a.signedFileSha === sha && a.providerSignedDate === providerSignedDate && a.customerSignedDate === customerSignedDate) return;
        if (a.status !== "ISSUED") throw new WdfError("Only an issued, unsigned agreement can receive a signed copy. Existing signed files cannot be replaced.", 409);
        const other = await tx.wdfServiceAgreement.findFirst({ where: { planId: a.planId, status: "SIGNED", id: { not: id } }, select: { id: true } });
        if (other && other.id !== a.supersedesId) throw new WdfError("Another signed agreement is current. Create a replacement referencing that agreement.", 409);
        if (a.supersedesId) {
          const previous = await tx.wdfServiceAgreement.findUnique({ where: { id: a.supersedesId } });
          if (!previous || previous.planId !== a.planId || previous.status !== "SIGNED") throw new WdfError("The agreement being replaced is no longer current. Create a fresh draft.", 409);
          await tx.wdfServiceAgreement.update({ where: { id: previous.id }, data: { status: "SUPERSEDED", supersededAt: new Date(), supersededById: id } });
        }
        await tx.wdfServiceAgreement.update({ where: { id }, data: {
          status: "SIGNED", signedAt: new Date(), signedByName: user.name, providerSignedDate, customerSignedDate,
          signedFileName: file.name.slice(0, 200), signedFileData: bytes, signedFileSha: sha,
        } });
        await tx.wdfLinenPlan.update({ where: { id: a.planId }, data: { version: { increment: 1 } } });
        await tx.wdfAudit.create({ data: { customerId: a.plan.customerId, actorId: user.id, actorName: user.name,
          action: "SERVICE_AGREEMENT_SIGNED_COPY_RECORDED", detail: { agreementId: id, fileSha: sha, providerSignedDate, customerSignedDate,
            supersedesId: a.supersedesId, ownerAttested: true, pages } } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(e.code)) throw new WdfError("Another agreement update is in progress. Reload and retry.", 409);
      throw e;
    }
    return NextResponse.json({ saved: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return respond(async () => { throw e; }); }
}
