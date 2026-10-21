
# Written rental agreements

Under WDF > Linen rental > customer, Written service agreements creates a draft,
exports a PDF, freezes an issued original, and retains an owner-reviewed signed PDF.
This is a business template, not an attorney-approved form or a promise of asset value.
Have North Carolina counsel review the base terms, assignment, fixed-term exit and
special provisions before customer use. Relevant background:
- https://www.ncleg.gov/EnactedLegislation/Statutes/PDF/BySection/Chapter_25/GS_25-2A-201.pdf
- https://www3.ncleg.gov/EnactedLegislation/Statutes/HTML/ByArticle/Chapter_25/Article_2A.html
- https://legacy.sba.gov/business-guide/manage-your-business/close-or-sell-your-business

## Owner workflow
1. Set the rental quantities and agreed weekly price first.
2. Create a contract version. Enter actual provider/customer legal names, mailing and
   service addresses, notice emails, authorized signers and titles.
3. Choose week-to-week or fixed initial term. 1/3/6/12/24/36-month date helpers are
   conveniences; review the actual inclusive end date. Fixed terms explicitly end or
   continue week-to-week. No automatic renewal into another fixed term.
4. Choose notice/cure/return/payment days, fixed-term early-exit option, replacement
   rates, assignment language, and any attorney-approved special terms.
5. Review the complete text and draft PDF. Issue for signature when correct.
6. Print/download the issued PDF, obtain both signatures, and upload the complete
   signed PDF with signature dates and owner attestation.
7. Changes require a new version. To replace the current signed contract, reference
   it in the draft. The earlier record becomes superseded only after the new signed
   copy is recorded. Earlier text, PDFs, scans, dates and hashes remain accessible.

Draft versions are also immutable; there is no in-place editing. Provider fields are
offered from the latest contract to reduce retyping; the owner must verify each one.
Nothing creates a live customer agreement automatically.
Only owners draft, issue, upload signed copies or retire records. Staff can view/print.
No personal guaranty, mandatory arbitration, exclusivity, accelerated future fees,
or automatic early-exit penalty is supplied. Adding such terms needs deliberate review.

## Retention and status
Original issued PDF bytes and signed PDF bytes are stored on the contract record,
separately from the deletable general Documents repository. Both have SHA-256 hashes.
PDFs are authenticated and not cached. Files over 10MB, unreadable/encrypted PDFs,
unsupported PDF-font characters in draft text, future signature dates, and overwrites
of a signed file are rejected. Uploading a scan does not verify signatures or read
the scan against the original; the named owner attests to that review.
Retiring an administrative record never itself legally terminates or releases a party.
SUPERSEDED and VOIDED records retain all prior evidence; no deletion API is provided.

## Operational limits
The contract snapshots quantities and prices; later rental-setting changes do not
rewrite any draft, issued original or signed copy. A price mismatch and expired fixed
initial term are flagged in the contract panel. Billing and inventory continue to use
the separate rental settings: term expiry, signature collection, legal termination,
price changes, replacements and invoice authorization are not automatically enforced.
The fixed-term price restriction and assignment provision are contract language, not
a guarantee of enforceability or a representation of a business-sale valuation.
This first version covers linen rental accounts, not general household WDF orders.
No electronic signing provider, automatic notices, email sends or bank charges are added.

## Checks
CI exercises term/date/party validation, authoritative pricing, multi-page PDF output,
font rejection, authorization, idempotent drafts/issues/uploads, immutable original
bytes after price changes, signature-date/file retention, scan-overwrite rejection,
supersession timing and evidence preservation after record retirement.
