
import { WdfError, integer, text } from "./wdf-pricing";

export const AGREEMENT_TEMPLATE_VERSION = "1";
export type AgreementTerms = {
  providerLegalName: string; providerAddress: string; providerEmail: string;
  customerLegalName: string; customerAddress: string; customerEmail: string;
  serviceAddress: string; providerSigner: string; providerTitle: string; customerSigner: string; customerTitle: string;
  startDate: string; termType: "WEEKLY" | "FIXED"; endDate: string | null;
  renewal: "END" | "WEEKLY"; noticeDays: number; earlyExit: "MUTUAL" | "NOTICE";
  paymentDays: number; cureDays: number; returnDays: number;
  assignment: "SALE" | "CONSENT"; specialTerms: string | null;
  itemName: string; towelsPerExchange: number; bagsPerExchange: number; weeklyFeeCents: number;
  exchangeDay: number | null; towelReplacementCents: number; bagReplacementCents: number;
};
export function civilDate(value: unknown, label: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new WdfError(label + " must be YYYY-MM-DD.");
  const d = new Date(value + "T12:00:00Z");
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new WdfError(label + " is invalid.");
  return value;
}
export function endAfterMonths(start: string, months: number) {
  civilDate(start, "Start date"); integer(months, "Term months", 1, 120);
  const d = new Date(start + "T12:00:00Z"), day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 12));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(day, last)); target.setUTCDate(target.getUTCDate() - 1);
  return target.toISOString().slice(0, 10);
}
function email(value: unknown, label: string) {
  const v = text(value, label, 254, true)!;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new WdfError(label + " is invalid.");
  return v;
}
export function agreementTerms(body: Record<string, unknown>, plan: {
  itemName: string; towelsPerExchange: number; bagsPerExchange: number; weeklyFeeCents: number | null; exchangeDay: number | null;
}): AgreementTerms {
  if (!plan.weeklyFeeCents) throw new WdfError("Set the agreed weekly price before creating a contract.");
  if (body.termType !== "WEEKLY" && body.termType !== "FIXED") throw new WdfError("Choose week-to-week or a fixed term.");
  const termType = body.termType;
  const startDate = civilDate(body.startDate, "Service start date");
  const endDate = termType === "FIXED" ? civilDate(body.endDate, "Fixed term end date") : null;
  if (endDate && endDate < startDate) throw new WdfError("The end date must be on or after the start date.");
  if (body.renewal !== "END" && body.renewal !== "WEEKLY") throw new WdfError("Choose what happens at the end of the term.");
  if (body.earlyExit !== "MUTUAL" && body.earlyExit !== "NOTICE") throw new WdfError("Choose a fixed-term early exit policy.");
  if (body.assignment !== "SALE" && body.assignment !== "CONSENT") throw new WdfError("Choose the assignment provision.");
  return {
    providerLegalName: text(body.providerLegalName, "Provider legal name", 300, true)!,
    providerAddress: text(body.providerAddress, "Provider mailing address", 500, true)!,
    providerEmail: email(body.providerEmail, "Provider notice email"),
    customerLegalName: text(body.customerLegalName, "Customer legal name", 300, true)!,
    customerAddress: text(body.customerAddress, "Customer mailing address", 500, true)!,
    customerEmail: email(body.customerEmail, "Customer notice email"),
    serviceAddress: text(body.serviceAddress, "Service address", 500, true)!,
    providerSigner: text(body.providerSigner, "Provider signer", 200, true)!,
    providerTitle: text(body.providerTitle, "Provider signer title", 200, true)!,
    customerSigner: text(body.customerSigner, "Customer signer", 200, true)!,
    customerTitle: text(body.customerTitle, "Customer signer title", 200, true)!,
    startDate, termType, endDate, renewal: termType === "WEEKLY" ? "WEEKLY" : body.renewal,
    earlyExit: termType === "WEEKLY" ? "NOTICE" : body.earlyExit,
    noticeDays: integer(body.noticeDays, "Termination notice days", 1, 180),
    paymentDays: integer(body.paymentDays, "Payment due days", 0, 90),
    cureDays: integer(body.cureDays, "Breach cure days", 1, 90),
    returnDays: integer(body.returnDays, "Stock return days", 1, 60),
    assignment: body.assignment, specialTerms: text(body.specialTerms, "Special negotiated terms", 6000),
    itemName: plan.itemName, towelsPerExchange: plan.towelsPerExchange, bagsPerExchange: plan.bagsPerExchange,
    weeklyFeeCents: plan.weeklyFeeCents, exchangeDay: plan.exchangeDay,
    towelReplacementCents: integer(body.towelReplacementCents, "Lost towel replacement price", 0, 100000),
    bagReplacementCents: integer(body.bagReplacementCents, "Lost bag replacement price", 0, 100000),
  };
}
const dollars = (c: number) => "$" + (c / 100).toFixed(2);
export function agreementDocument(t: AgreementTerms, supersededNumber?: number): string {
  const day = t.exchangeDay === null ? "a weekday agreed by the parties in writing" : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][t.exchangeDay];
  const term = t.termType === "WEEKLY" ?
    "Service begins " + t.startDate + " and continues week-to-week until terminated under this agreement." :
    "The initial fixed term begins " + t.startDate + " and ends " + t.endDate + ". " +
    (t.renewal === "END" ? "Service ends on that date unless the parties sign a renewal." :
      "After the initial term, service continues week-to-week unless either party gives at least " + t.noticeDays + " days' written notice of nonrenewal.");
  const termination = t.termType === "WEEKLY" ?
    "Either party may end week-to-week service on at least " + t.noticeDays + " days' written notice." :
    (t.earlyExit === "NOTICE" ? "Either party may end the initial term early without an early-exit penalty on at least " + t.noticeDays + " days' written notice." :
      "Neither party has a right to terminate the initial term merely for convenience. Early termination requires a written agreement signed by both parties, or a termination right expressly stated here or provided by law.") +
    (t.renewal === "WEEKLY" ? " During a later week-to-week renewal, either party may terminate on at least " + t.noticeDays + " days' written notice." : "");
  return [
    "LINEN RENTAL AND LAUNDRY SERVICE AGREEMENT",
    "1. Parties and service location\nProvider: " + t.providerLegalName + ", doing business as Clinton Laundry Works. Mailing address: " + t.providerAddress + ". Notice email: " + t.providerEmail + ".\nCustomer: " + t.customerLegalName + ". Mailing address: " + t.customerAddress + ". Notice email: " + t.customerEmail + ".\nService location: " + t.serviceAddress + ".",
    "2. Service and rental stock\nProvider owns the rental " + t.itemName + " and reusable bags. The scheduled weekly service includes an exchange of up to " + t.towelsPerExchange + " clean towels and " + t.bagsPerExchange + " clean bags on " + day + ", collection of soiled stock, and laundering. This quantity is the exchange allowance, not a transfer of ownership or a promise of total onsite inventory. Opening stock and later deliveries/returns will be recorded in the customer ledger. Extra quantities, trips or services require a separately agreed written price.",
    "3. Term and renewal\n" + term,
    "4. Weekly price and payment\nThe agreed price is " + dollars(t.weeklyFeeCents) + " per scheduled service week, plus applicable taxes. This is a weekly service price, not a representation of a fixed annual total. Invoices are due " + (t.paymentDays === 0 ? "on receipt" : "within " + t.paymentDays + " days of invoice date") + ". Cash, check and credit card are accepted; no automatic card authorization is created by signing. The weekly fee covers the reserved exchange service even when Customer uses fewer towels. Provider will credit a scheduled service it fails to provide, unless the missed service resulted from Customer denying access or another arrangement was agreed in writing. During an initial fixed term, price changes require a signed written amendment. During week-to-week service, a proposed price change requires at least 30 days' written notice; Customer may terminate before the increase takes effect.",
    "5. Handling, counts and replacement\nCustomer will keep clean and soiled stock separate, provide reasonable collection access and use towels only for ordinary disclosed business purposes. Customer must disclose unusual contamination and must not put sharp objects or hazardous substances in collection bags. Ordinary wear and normal laundering replacement are included. Clean dry towel counts may be estimated using a calibrated scale and bag tare; soiled returns are counted. Estimated shortages alone do not establish a loss charge. The parties will reconcile discrepancies before replacement charges are assessed. Confirmed stock lost, discarded or damaged beyond ordinary wear is chargeable only at the agreed rates: towel " + dollars(t.towelReplacementCents) + " each; reusable bag " + dollars(t.bagReplacementCents) + " each. A zero rate means no separate replacement charge for that item. Such charges are documented and are not added automatically by the inventory system.",
    "6. Ending service and breach\n" + termination + " Either party may terminate for a material breach that remains uncured for " + t.cureDays + " days after written notice describing the breach. No automatic acceleration of remaining weekly fees or liquidated-damages penalty is created by this template. Accrued amounts and any otherwise lawful remedies are preserved. Customer must make Provider's remaining stock available for collection within " + t.returnDays + " days after service ends. Provider will arrange final collection; confirmed unreturned stock is handled under section 5.",
    "7. Assignment and a sale of the business\n" + (t.assignment === "SALE" ?
      "Customer consents to Provider assigning this agreement in connection with a sale of substantially all of the linen-service business or its related operating assets, provided the successor assumes the service obligations in writing and Customer receives written notice identifying the successor and its contact information. The assignment does not change Customer's price, service rights or defenses. Any other assignment by either party requires the other party's prior written consent." :
      "Neither party may assign this agreement without the other party's prior written consent, including an assignment connected with a sale of the business."),
    "8. Notices, changes and governing law\nNotices must be sent to the mailing address or notice email in section 1, with a record of delivery or receipt; each party will give written notice of contact changes. This agreement, its service schedule and the special terms below are the parties' entire agreement about this service. Material changes require a written amendment signed by both parties, except a week-to-week price change expressly permitted by section 4. North Carolina law governs. No personal guaranty, mandatory arbitration or exclusive-service restriction is created. Each signer represents that they are authorized to bind the named business.",
    "9. Special negotiated terms\n" + (t.specialTerms || "None.") + (supersededNumber ? "\nWhen signed by both parties, this agreement replaces service agreement #" + supersededNumber + " for prospective service; accrued obligations under the earlier agreement are preserved." : "") + "\nSpecific negotiated terms in this section control over conflicting standard terms above.",
    "10. Signatures\nSigning acknowledges the service quantities, weekly price, term, renewal and termination provisions above. Both parties should retain a complete signed copy.\n\nPROVIDER: " + t.providerLegalName + "\nSignature: _______________________________________  Date: __________________\nPrinted name: " + t.providerSigner + "\nTitle: " + t.providerTitle + "\n\nCUSTOMER: " + t.customerLegalName + "\nSignature: _______________________________________  Date: __________________\nPrinted name: " + t.customerSigner + "\nTitle: " + t.customerTitle,
  ].join("\n\n").replace(/\r\n/g, "\n").replace(/\t/g, "    ");
}
