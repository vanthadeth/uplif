import { redirect } from "next/navigation";

/** The old Me tab. Its content moved to Menu and Profile; keep old links working. */
export default function MePage() {
  redirect("/menu");
}
