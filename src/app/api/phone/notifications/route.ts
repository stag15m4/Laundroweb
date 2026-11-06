import { denied, phoneUser } from "@/lib/phone/access";
import { getPhoneNotificationSummary } from "@/lib/phone/notifications";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await phoneUser();
  if (!user) return denied();
  return Response.json(await getPhoneNotificationSummary(user.id), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
