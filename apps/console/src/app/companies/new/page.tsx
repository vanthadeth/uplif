import { requireStep } from "@/lib/auth/session";
import { Wizard } from "./wizard";

export default async function NewCompanyPage() {
  await requireStep("/companies/new");
  return <Wizard />;
}
