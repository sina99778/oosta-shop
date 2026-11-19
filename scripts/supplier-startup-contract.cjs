/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, ".."),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "oosta-startup-")),
  file = path.join(temp, "fixture.env");
fs.writeFileSync(
  file,
  "DATABASE_URL=postgresql://fixture:unused@127.0.0.1:1/unused\nJWT_SECRET=synthetic-startup-fixture-only\nNODE_ENV=test\nAPI_PORT=45678\n",
);
const entry = path.join(root, "apps/api/src/index.ts"),
  envModule = path.join(root, "apps/api/src/config/env.ts");
const script = `require('tsx/cjs');const Module=require('node:module');const load=Module._load;Module._load=function(name,...args){if(name==='./modules/suppliers/fx.service')return{startFxRefresh:()=>()=>{}};if(name==='./modules/suppliers/suppliers.service'){require(${JSON.stringify(envModule)});return {startCatalogRefresh:()=>()=>{}};}if(name==='./app')return{createApp:()=>({locals:{supplierCheckout:{start:()=>{console.log('WORKER_STARTUP_PASS');return()=>{}}}},listen:(port,fn)=>{fn();return{close:fn=>fn()};}})};if(name==='./lib/prisma')return{prisma:{$disconnect:async()=>{}}};if(name==='./bot')return{startBot:()=>{}};return load.call(this,name,...args);};require(${JSON.stringify(entry)});console.log('DOTENV_STARTUP_PASS');`;
try {
  const env = { ...process.env, DOTENV_CONFIG_PATH: file };
  for (const key of [
    "DATABASE_URL",
    "JWT_SECRET",
    "NODE_ENV",
    "API_PORT",
    "SUPPLIER_CREDENTIALS_FILE",
  ])
    delete env[key];
  const run = spawnSync(process.execPath, ["-e", script], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 15000,
  });
  assert.equal(run.status, 0, "Environment must load before supplier/Prisma imports validate it");
  assert(run.stdout.includes("DOTENV_STARTUP_PASS"));
  assert(run.stdout.includes("WORKER_STARTUP_PASS"));
  console.log(
    "PASS: startup loads synthetic dotenv before configuration validation without DB/network/listener",
  );
} finally {
  fs.unlinkSync(file);
  fs.rmdirSync(temp);
}
