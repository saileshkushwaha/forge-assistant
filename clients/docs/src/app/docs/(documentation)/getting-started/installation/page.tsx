import { GettingStartedContent } from "@/app/docs/_components/getting-started-content";
import { createMetadata } from "@/lib/metadata";

export const metadata = createMetadata({
  title: "Installation - Forge Docs",
  description:
    "Get started with Forge: sign up for Forge Cloud, install the desktop app on macOS, or self-host. System requirements, setup, and permissions.",
  path: "/docs/getting-started/installation",
});

export default function InstallationPage() {
  return <GettingStartedContent />;
}
