import { WhatIsForgeContent } from "@/app/docs/_components/what-is-forge-content";
import { createMetadata } from "@/lib/metadata";

export const metadata = createMetadata({
  title: "What is Forge? - Forge Docs",
  description:
    "What is Forge? A personal AI assistant with tools, memory, identity, and a private cloud workspace, different from ChatGPT or Claude.",
  path: "/docs/getting-started/what-is-forge",
});

export default function WhatIsForgePage() {
  return <WhatIsForgeContent />;
}
