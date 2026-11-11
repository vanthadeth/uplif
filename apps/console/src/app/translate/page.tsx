import { redirect } from "next/navigation";

// The translation community moved to /language. Old links and bookmarks land there.
export default function TranslatePage() {
  redirect("/language/community");
}
