// Placeholder entry point for the API.
// The real Express server (config, security middleware, routes) is built in Phase 2.

export const appInfo = {
  name: "oosta-api",
  status: "scaffold",
} as const;

function main(): void {
  console.log(`[${appInfo.name}] scaffold ready (${appInfo.status})`);
}

if (require.main === module) {
  main();
}
