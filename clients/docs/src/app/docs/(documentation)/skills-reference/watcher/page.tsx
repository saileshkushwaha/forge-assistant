import { SkillsReferenceWatcherContent } from "@/app/docs/_components/skills-reference-watcher-content";
import { createMetadata } from "@/lib/metadata";

export const metadata = createMetadata({
  title: "Watcher - Forge Docs",
  description:
    "Watcher skill for Forge — polls external services for changes and notifies you when something happens.",
  path: "/docs/skills-reference/watcher",
});

export default function SkillsReferenceWatcherPage() {
  return <SkillsReferenceWatcherContent />;
}
