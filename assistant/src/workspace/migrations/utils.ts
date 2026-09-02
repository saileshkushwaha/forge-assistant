import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Resolve the legacy Forge root directory (~/.forge).
 *
 * Resolution order:
 * 1. Parent of FORGE_WORKSPACE_DIR — e.g. /data/.forge/workspace → /data/.forge
 * 2. If that parent is "/" (workspace at top level, e.g. /workspace), fall back
 *    to homedir()/.forge
 *
 * This replaces the old inlined `getRootDir()` pattern used by individual migrations.
 */
export function getForgeRoot(): string {
  const workspaceDir = process.env.FORGE_WORKSPACE_DIR?.trim();
  if (workspaceDir) {
    const parent = dirname(workspaceDir);
    if (parent !== "/") {
      return parent;
    }
  }
  return join(homedir(), ".forge");
}
