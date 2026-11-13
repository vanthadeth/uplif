"use client";
import { useParams } from "next/navigation";
import { GuideView } from "@/components/playbook-view";

export default function GuidePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="flex flex-col gap-4 p-4">
      <GuideView id={id} />
    </div>
  );
}
