import { GettingStartedOverviewContent } from "@/app/docs/_components/getting-started-overview-content";
import { createMetadata } from "@/lib/metadata";

export const metadata = createMetadata({
  title: "Getting Started - Forge Docs",
  description:
    "Get started with Forge: installation, key concepts, a quick start guide, and self-improving skills.",
  path: "/docs/getting-started",
});

export default function GettingStartedPage() {
  return <GettingStartedOverviewContent />;
}
