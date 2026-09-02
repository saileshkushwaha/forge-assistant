import { WebSearchBraveContent } from "@/app/docs/_components/web-search-brave-content";
import { createMetadata } from "@/lib/metadata";

export const metadata = createMetadata({
  title: "Brave Search - Web Search - Forge Docs",
  description:
    "How to connect Brave Search as your web search provider in Forge: API key setup, provider configuration, and usage.",
  path: "/docs/key-concepts/web-search/brave",
});

export default function BravePage() {
  return <WebSearchBraveContent />;
}
