import { SkillsReferenceContactsContent } from "@/app/docs/_components/skills-reference-contacts-content";
import { createMetadata } from "@/lib/metadata";

export const metadata = createMetadata({
  title: "Contacts - Forge Docs",
  description:
    "Contacts skill for Forge — manage contacts, communication channels, access control, and invite links.",
  path: "/docs/skills-reference/contacts",
});

export default function SkillsReferenceContactsPage() {
  return <SkillsReferenceContactsContent />;
}
