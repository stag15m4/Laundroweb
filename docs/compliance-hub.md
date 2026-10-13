# Compliance calendar and Legal connection

Owners can create and manage deadlines at /dashboard/compliance. Civil dates are
stored as YYYY-MM-DD so time zones cannot move renewals to another day. Completion
and generation of the next monthly/quarterly/yearly deadline happen in one serializable
transaction. A unique parent ID prevents duplicate renewals after retries or reopening.

Deploy adds the ComplianceDeadline table via the existing Prisma schema deployment.
Set a new dedicated COMPLIANCE_SERVICE_TOKEN on Laundroweb; set the same key as
LAUNDROWEB_COMPLIANCE_TOKEN on Legal, plus LAUNDROWEB_COMPLIANCE_URL to this app's
HTTPS origin. Map the Laundroweb business to its existing entity in Legal's
Compliance Calendar → Business connections. The business ID is `laundroweb`.

GET /api/integrations/compliance/tenants and
GET /api/integrations/compliance?tenant_id=laundroweb require X-Compliance-Token.
The key has no write access. Owner mutations require a normal session and matching
Origin. Legal validates the complete version 1 snapshot and normally checks once a
minute. It retains last-good data and shows freshness warnings if a source fails.

Alfred reads the combined deadlines from Legal, not directly from Laundroweb.
Companion repos: Loan-Docs, Coffee-Management-Suite, and The-Consultant's deployed
claude/personal-ai-assistant-Eq5os branch.
