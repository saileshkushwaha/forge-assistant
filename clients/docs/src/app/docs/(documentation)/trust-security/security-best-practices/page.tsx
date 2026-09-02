import { TrustSecurityBestPracticesContent } from "@/app/docs/_components/trust-security-best-practices-content";
import { createMetadata } from "@/lib/metadata";

export const metadata = createMetadata({
  title: "Security Best Practices - Forge Docs",
  description:
    "Security best practices for Forge — sharing information, reviewing files, permissions, and credentials.",
  path: "/docs/trust-security/security-best-practices",
});

export default function TrustSecurityBestPracticesPage() {
  return <TrustSecurityBestPracticesContent />;
}
