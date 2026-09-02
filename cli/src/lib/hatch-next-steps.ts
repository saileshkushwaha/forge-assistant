export function logHatchNextSteps(
  log: (message: string) => void,
  instanceName: string,
): void {
  log("Next steps:");
  log("  forge client");
  log('  forge message "hello"');
  log("  forge events");
  log("  forge ps");
  log(`  forge use ${instanceName}`);
  log("");
}
