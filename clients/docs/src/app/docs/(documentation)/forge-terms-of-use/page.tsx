import { TermsOfUseBody } from "@/app/docs/(documentation)/forge-terms-of-use/_components/terms-of-use-body";
import { createMetadata } from "@/lib/metadata";
import { routes } from "@/lib/routes";

export const metadata = createMetadata({
  title: "Terms of Service - Forge",
  description:
    "Forge's terms of service — the agreement governing your use of the Forge AI agent platform and services.",
  path: routes.docs.legal.termsOfUse,
});

export default function TermsOfUsePage() {
  return <TermsOfUseBody />;
}
