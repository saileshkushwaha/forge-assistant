/**
 * @forgeai/ces-client/credential-rpc
 *
 * Re-exports the credential RPC surface from `@forgeai/service-contracts` so
 * consumers that depend on `@forgeai/ces-client` can access the CES wire
 * protocol types through this package without a separate dependency on
 * `@forgeai/service-contracts`.
 *
 * Prefer importing directly from `@forgeai/service-contracts/credential-rpc`
 * for new code outside of the ces-client boundary.
 */

export * from "@forgeai/service-contracts/credential-rpc";
