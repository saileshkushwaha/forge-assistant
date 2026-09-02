import { SkillsReferenceSubagentContent } from "@/app/docs/_components/skills-reference-subagent-content";
import { createMetadata } from "@/lib/metadata";

export const metadata = createMetadata({
  title: "Subagent - Forge Docs",
  description:
    "Subagent skill for Forge — spawns autonomous background agents that work independently on tasks.",
  path: "/docs/skills-reference/subagent",
});

export default function SkillsReferenceSubagentPage() {
  return <SkillsReferenceSubagentContent />;
}
