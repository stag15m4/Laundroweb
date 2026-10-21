
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { WdfError, text, key } from "@/lib/wdf-pricing";
import { agreementTerms, agreementDocument, AGREEMENT_TEMPLATE_VERSION } from "@/lib/service-agreement";
import { agreementPdf } from "@/lib/agreement-pdf";

type Actor = { id: string; name: string; role: string };
export const agreementSelect = {
  id: true, number: true, planId: true, version: true, status: true, supersedesId: true, terms: true,
  documentText: true, documentSha: true, templateVersion: true, createdByName: true, createdAt: true,
  issuedAt: true, issuedByName: true, issuedPdfSha: true, signedAt: true, signedByName: true,
  providerSignedDate: true, customerSignedDate: true, signedFileName: true, signedFileSha: true,
  supersededAt: true, supersededById: true, voidedAt: true, voidedByName: true, voidReason: true,
} as const;
function audit(user: Actor, customerId: string, action: string, detail: Prisma.InputJsonValue) {
  return { customerId, action, actorId: user.id, actorName: user.name, detail };
}
export async function readAgreements(customerId: string | null) {
  if (!customerId) throw new WdfError("Select a customer.");
  const plan = await prisma.wdfLinenPlan.findUnique({ where: { customerId } });
  const customer = await prisma.wdfCustomer.findUnique({ where: { id: customerId }, select: { name: true, company: true, email: true } });
  const recent = await prisma.wdfServiceAgreement.findFirst({ orderBy: { createdAt: "desc" }, select: { terms: true } });
  const last = recent?.terms as Record<string, unknown> | undefined;
  const providerDefaults = last ? Object.fromEntries(["providerLegalName", "providerAddress", "providerEmail", "providerSigner", "providerTitle"].map(k => [k, last[k]])) : {};
  if (!plan) return { agreements: [], plan: null, customer, providerDefaults };
  const agreements = await prisma.wdfServiceAgreement.findMany({ where: { planId: plan.id }, select: agreementSelect, orderBy: { version: "desc" }, take: 100 });
  return { agreements, plan, customer, providerDefaults };
}
export async function writeAgreement(tx: Prisma.TransactionClient, user: Actor, body: Record<string, unknown>, digest: string) {
  if (user.role !== "OWNER") throw new WdfError("Only an owner can create, issue or retire a service agreement.", 403);
  const customerId = text(body.customerId, "Customer", 100, true)!;
  const plan = await tx.wdfLinenPlan.findUnique({ where: { customerId } });
  if (!plan) throw new WdfError("Set up a linen rental agreement first.", 409);
  if (body.action === "agreement.create") {
    const requestKey = key(body.requestKey);
    const existing = await tx.wdfServiceAgreement.findUnique({ where: { requestKey }, select: agreementSelect });
    if (existing) {
      const original = await tx.wdfServiceAgreement.findUnique({ where: { id: existing.id }, select: { requestDigest: true } });
      if (existing.planId !== plan.id || original?.requestDigest !== digest) throw new WdfError("Request key was used for different contract details.", 409);
      return { agreement: existing };
    }
    if (!body.terms || typeof body.terms !== "object" || Array.isArray(body.terms)) throw new WdfError("Enter contract terms.");
    const terms = agreementTerms(body.terms as Record<string, unknown>, plan);
    const supersedesId = text(body.supersedesId, "Agreement to replace", 100);
    const previous = supersedesId ? await tx.wdfServiceAgreement.findUnique({ where: { id: supersedesId } }) : null;
    if (supersedesId && (!previous || previous.planId !== plan.id || previous.status !== "SIGNED"))
      throw new WdfError("Only a signed agreement for this customer can be replaced.", 409);
    const documentText = agreementDocument(terms, previous?.number);
    const documentSha = createHash("sha256").update(documentText).digest("hex");
    const last = await tx.wdfServiceAgreement.findFirst({ where: { planId: plan.id }, orderBy: { version: "desc" }, select: { version: true } });
    const version = (last?.version ?? 0) + 1;
    // Validate all PDF text before accepting a draft; do not silently substitute
    // characters in legal names or terms.
    await agreementPdf(documentText, 0, version, "DRAFT", documentSha);
    const agreement = await tx.wdfServiceAgreement.create({ data: {
      planId: plan.id, requestKey, requestDigest: digest, version, supersedesId,
      terms: JSON.parse(JSON.stringify(terms)), documentText, documentSha, templateVersion: AGREEMENT_TEMPLATE_VERSION,
      createdById: user.id, createdByName: user.name,
    }, select: agreementSelect });
    await tx.wdfAudit.create({ data: audit(user, customerId, "SERVICE_AGREEMENT_DRAFTED", { agreementId: agreement.id, number: agreement.number, version, documentSha }) });
    return { agreement };
  }
  const id = text(body.agreementId, "Agreement", 100, true)!;
  const agreement = await tx.wdfServiceAgreement.findUnique({ where: { id } });
  if (!agreement || agreement.planId !== plan.id) throw new WdfError("Agreement not found for this customer.", 404);
  if (body.action === "agreement.issue") {
    if (agreement.status === "ISSUED" || agreement.status === "SIGNED") return { agreement: await tx.wdfServiceAgreement.findUnique({ where: { id }, select: agreementSelect }) };
    if (agreement.status !== "DRAFT") throw new WdfError("Only a draft can be issued.", 409);
    if (body.reviewed !== true) throw new WdfError("Review the complete agreement before issuing it.");
    const pdf = await agreementPdf(agreement.documentText, agreement.number, agreement.version, "ISSUED", agreement.documentSha);
    const issued = await tx.wdfServiceAgreement.update({ where: { id }, data: {
      status: "ISSUED", issuedAt: new Date(), issuedByName: user.name, issuedPdf: Buffer.from(pdf),
      issuedPdfSha: createHash("sha256").update(pdf).digest("hex"),
    }, select: agreementSelect });
    await tx.wdfAudit.create({ data: audit(user, customerId, "SERVICE_AGREEMENT_ISSUED", { agreementId: id, documentSha: agreement.documentSha, pdfSha: issued.issuedPdfSha }) });
    return { agreement: issued };
  }
  if (body.action === "agreement.void") {
    if (agreement.status === "VOIDED") throw new WdfError("This record is already retired.", 409);
    const reason = text(body.reason, "Retirement reason", 2000, true)!;
    await tx.wdfServiceAgreement.update({ where: { id }, data: { status: "VOIDED", voidedAt: new Date(), voidedByName: user.name, voidReason: reason } });
    await tx.wdfAudit.create({ data: audit(user, customerId, "SERVICE_AGREEMENT_RETIRED", { agreementId: id, previousStatus: agreement.status, reason }) });
    return { saved: true };
  }
  throw new WdfError("Unknown agreement action.");
}
