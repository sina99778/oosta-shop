/* eslint-disable @typescript-eslint/no-require-imports */
// Test the exact matcher loaded by TypeScript ESLint, not minimatch's unrelated v3 branch.
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const fromLint = createRequire(require.resolve("@typescript-eslint/typescript-estree"));
const { version } = fromLint("minimatch/package.json");
const [major, minor, patch] = version.split(".").map(Number);
assert(
  major > 11 || (major === 11 && (minor > 0 || patch >= 1)),
  `Unpatched lint matcher: ${version}`,
);
const { minimatch } = fromLint("minimatch");
assert.equal(minimatch("src/app.ts", "src/**/*.ts", { dot: true }), true);
assert.equal(minimatch("src/.internal/app.ts", "src/**/*.ts", { dot: true }), true);
assert.equal(minimatch("src/app.js", "src/**/*.ts", { dot: true }), false);
assert.equal(minimatch("outside/app.ts", "src/**/*.ts", { dot: true }), false);
console.log("PASS: TypeScript lint uses a patched matcher and preserves project-file matching");

const fromPrisma = createRequire(require.resolve("@prisma/config"));
const { version: effectVersion } = fromPrisma("effect/package.json");
const [effectMajor, effectMinor, effectPatch] = effectVersion.split(".").map(Number);
assert(
  effectMajor === 3 && (effectMinor > 22 || (effectMinor === 22 && effectPatch >= 1)),
  `Prisma config requires a patched Effect 3 release: ${effectVersion}`,
);

// Exercise Prisma's c12 loader as well as the merge function itself, without a database.
async function checkPrismaLoader() {
  const fs = require("node:fs/promises");
  const path = require("node:path");
  const os = require("node:os");
  const { loadConfigFromFile } = require("@prisma/config");
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "oosta-prisma-config-"));
  const configFile = path.join(fixture, "prisma.config.mjs");
  try {
    await fs.writeFile(
      configFile,
      'export default { schema: "schema.prisma", migrations: { path: "migrations", seed: "node fixture.cjs" } };',
    );
    const loaded = await loadConfigFromFile({ configRoot: fixture, configFile });
    assert.equal(loaded.error, undefined);
    assert.equal(loaded.config.schema, path.join(fixture, "schema.prisma"));
    assert.equal(loaded.config.migrations.path, path.join(fixture, "migrations"));
    assert.equal(loaded.config.migrations.seed, "node fixture.cjs");
    const missing = await loadConfigFromFile({
      configRoot: fixture,
      configFile: path.join(fixture, "missing.config.mjs"),
    });
    assert.equal(missing.error?._tag, "ConfigFileNotFound");
    console.log(
      "PASS: Prisma loads nested fixture configuration and rejects a missing explicit config",
    );
  } finally {
    // Only files created above are removed; no recursive deletion or working DB access.
    await fs.unlink(configFile);
    await fs.rmdir(fixture);
  }
}

checkPrismaLoader().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
