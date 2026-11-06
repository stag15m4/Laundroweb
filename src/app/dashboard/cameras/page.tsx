import { redirect } from "next/navigation";

// Retired camera viewer: existing bookmarks return to the activity dashboard.
export default function CamerasPage() {
  redirect("/dashboard");
}
