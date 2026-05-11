import { redirect } from "next/navigation";

export default function ConnectionsPage() {
  redirect("/chat?connections=1");
}
