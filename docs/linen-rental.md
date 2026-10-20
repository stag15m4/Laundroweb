
# Linen rental in the WDF POS

Open WDF > Linen rental, or open any WDF customer and use their Linen rental panel.
Owners create one rental agreement per CRM customer: towel type, typical towels
and bags per exchange, optional weekday, optional weekly price, and bag/towel weights.
No Lydia account, price, towel stock or delivery is seeded into production.

## Deliveries and collections
Staff record clean towels and bags delivered and soiled towels and bags returned.
Customer custody = deliveries - returns - write-offs + owner corrections.
Returns may be smaller than deliveries: the difference remains in custody; there
is no automatic accusation of loss or additional charge.
Exchanges append immutable records naming the employee. They do not make invoices.
Owner write-offs require a reason and cannot make stock negative.
Opening stock and corrections are explicit, reasoned owner reconciliation entries;
prior records remain intact. Paused customers can return stock but cannot receive
new stock or be invoiced. Quantities are customer custody, not shop-wide inventory.

For clean dry deliveries, optionally estimate towel count by grams:
round((gross weight - empty bag grams * delivered bag count) / calibrated towel grams).
All the delivered bags must be included in the gross weighing. Calibrate using a
counted sample of identical clean dry towels. Dirty/wet returns must be counted.
The estimate, gross weight, combined tare and per-towel calibration are saved with
the movement, so later calibration changes cannot rewrite history. Estimates
are labeled throughout, and should be spot-checked rather than treated as exact.

## Weekly invoices
The agreed weekly rental price is separate from $2/lb WDF pricing.
Choose the Monday starting the service week, then Create/open weekly invoice.
Staff can invoice at the owner-set price; they cannot set or override the agreement.
The invoice is a flat specialty line in the existing POS (zero weight, no WDF minimum),
with the then-current price, towel type and exchange quantity preserved in the line.
One database-unique invoice per program/week prevents duplicate billing. Reopening
a billed week returns the original invoice even after agreement pricing changes.
Cancelled invoices remain associated with that week; they are not silently reissued.
Billing is explicit, not an automatic subscription or a bank charge.
Use existing WDF cash/check/card payment handling and printed invoice/receipt.

$2,000/year is a pricing discussion, not an enforced annual subscription.
At $38.46/week, 52 weeks total $1,999.92; a calendar year can have 53 service Mondays.
Set the actual agreed price and service period with the customer before billing.

## Verification
Adds three Prisma tables and optional back-relations only. Existing app startup
applies the additive schema. No external services or credentials required.
CI verifies custody math, weight/tare estimates, civil service dates, owner/staff
permissions, idempotent deliveries, stale updates, shortages, write-offs, corrections,
paused-account returns, customer isolation, unique concurrent weekly invoicing,
immutable invoice prices and existing payment processing records.
