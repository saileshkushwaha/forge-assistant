import { DeveloperGuideContent } from "@/app/docs/_components/developer-guide-content";
import { createMetadata } from "@/lib/metadata";

export const metadata = createMetadata({
  title: "Developer Guide - Forge Docs",
  description:
    "Technical reference for contributors and developers working on the Forge Assistant platform.",
  path: "/docs/developer-guide",
});

export default function DeveloperGuidePage() {
  return <DeveloperGuideContent />;
}
