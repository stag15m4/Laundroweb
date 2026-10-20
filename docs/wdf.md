
# Wash Dry Fold at Clinton Laundry Works

Open **Wash Dry Fold** in the owner or staff menu. Add a customer, then create an order.
The standard price is $2.00/lb with a $25 minimum for weighted laundry.
Specialty-only orders use item prices without the weighted-laundry minimum.
Both defaults live in src/lib/wdf-pricing.ts.

## Customers and pricing
Owners can negotiate a per-pound rate, a minimum (including zero), and an optional
expiration time. A reason is required. Expired terms revert to standard terms.
Staff can add customers and edit contact information and laundry preferences.
Only owners can edit negotiated terms, archive customers, override order pricing,
or enter custom specialty-item prices. There is no manager role in the existing app.
Customer history includes invoiced amounts, net collections, pounds, recorded labor
and realized laundry revenue per pound (minimums included; specialty items excluded).

Orders snapshot customer contact information, laundry preferences, rates, minimums,
line-item amounts, and the pricing reason. Subsequent customer edits never rewrite
old invoices. Financial order lines cannot be edited after creation; cancel an
unpaid order and replace it if the price/weight was wrong. Refund/reverse paid
entries before cancelling. Customer records and financial history cannot be deleted.

## Processing and printing
Received -> Washing -> Drying -> Folding -> Ready -> Picked up.
Staff advance one stage at a time; owners may correct the stage.
Cancellation is owner-only, needs a reason, and requires zero net payments.
A picked-up order can remain unpaid; pickup and payment are separate.
Record total hands-on labor minutes and washer/dryer usage in the order.
Print an invoice/receipt or a bag ticket. Bag tickets contain internal order
instructions; customer receipts omit internal notes, pricing reasons and audit data.
Print views require a session and fetch order data through the same authenticated API.

## Payments
Cash, check and credit card can be split or partial. Record only the amount applied,
not cash tendered; the screen calculates change. A check number is required.
Card charges occur in the bank's iPhone Tap to Pay app. After it confirms success,
record the amount and optional reference. Laundroweb never charges a card, stores
card numbers, or confirms transactions against bank deposits. Refunds also happen
externally first. Card refunds require confirmation of success in the bank app.

Owners can record refunds (negative ledger entries) and reverse erroneous entries
or returned checks with a reason. Reversal does not issue a bank refund.
Original entries remain visible. Serializable database transactions prevent
competing payments from overpaying. Per-request keys make exact retries idempotent.
Changed payloads cannot reuse a key. Order/customer versions protect stale edits.

## Reporting boundaries
WDF invoices and net payments are reported within WDF, separately from existing
machine revenue. There is no automatic posting into RevenueEntry or accounting:
do not assume existing Finance reports include WDF, and avoid entering both a bank
deposit and its individual payments as new sales. Processor fees and bank reconciliation
remain outside this initial module. Taxes, delivery, automated messages, card processing
and automatic FasCard machine starts are not implemented here.
Machine usage is entered manually; a future ProLink adapter can link order cycles.

## Deployment and verification
These are additive Prisma models only; no existing tables or data are rewritten.
The existing application startup applies the schema with prisma db push.
CI generates Prisma, typechecks, tests price calculations, builds, then uses its
throwaway PostgreSQL database to test customer permissions, immutable prices,
duplicate submissions, competing payments, partial/split payments, refunds,
returned checks, processing versions, CRM totals, print access, and origin protection.
No new external services or credentials are required.
