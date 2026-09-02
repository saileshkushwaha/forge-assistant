import { HostingOptionsCloudHostingContent } from "@/app/docs/_components/hosting-options-cloud-hosting-content";
import { createMetadata } from "@/lib/metadata";

export const metadata = createMetadata({
  title: "Cloud hosting - Forge Docs",
  description:
    "Run your assistant on Forge Cloud: always-on, sandboxed per account, reachable from web, desktop, voice, and chat channels.",
  path: "/docs/hosting-options/cloud-hosting",
});

export default function CloudHostingPage() {
  return <HostingOptionsCloudHostingContent />;
}
