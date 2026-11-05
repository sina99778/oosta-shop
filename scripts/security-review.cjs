/* eslint-disable @typescript-eslint/no-require-imports */
// Isolated review probes. No real database, gateway, bot, or listening socket.
// Run from repository root: node scripts/security-review.cjs
process.env.NODE_ENV = 'production';
process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/unused';
process.env.JWT_SECRET = 'audit-only-secret-that-is-never-deployed';
process.env.PAYMENT_PROVIDER = 'zarinpal';
process.env.ZARINPAL_MERCHANT_ID = 'audit-placeholder-merchant';
process.env.TELEGRAM_BOT_TOKEN = '';
require('tsx/cjs');
const assert = require('node:assert/strict');
const { prisma } = require('../apps/api/src/lib/prisma.ts');
const { deliverOrder, verifyAndDeliver, uploadReceipt } = require('../apps/api/src/modules/orders/orders.service.ts');
const { createApp } = require('../apps/api/src/app.ts');
const { inject } = require('light-my-request');
const bcrypt = require('bcryptjs');
const { signupSchema } = require('../apps/api/src/modules/auth/auth.schemas.ts');

async function main() {
  let status = 'PENDING';
  let reads = 0;
  let release;
  const barrier = new Promise(r => { release = r; });
  const sold = [];
  let nextUnit = 0;
  const tx = {
    order: {
      findUnique: async () => {
        const snapshot = { id: 'order', paymentStatus: status, items: [{ id: 'line', planId: 'plan', quantity: 1 }] };
        if (++reads === 2) release();
        await barrier;
        return snapshot;
      },
      update: async ({ data }) => { status = data.paymentStatus; },
    },
    $queryRaw: async () => [{ id: `unit-${++nextUnit}` }],
    inventoryItem: { updateMany: async ({ where }) => { sold.push(...where.id.in); } },
  };
  prisma.$transaction = async fn => fn(tx);
  await Promise.all([deliverOrder('order', 'ref'), deliverOrder('order', 'ref')]);
  assert.equal(sold.length, 2);
  console.log('CONFIRMED (mocked DB interleaving): one quantity=1 order consumes two units', JSON.stringify(sold));

  status = 'PENDING';
  let releaseUpdate;
  let enteredUpdate;
  const entered = new Promise(r => { enteredUpdate = r; });
  const gate = new Promise(r => { releaseUpdate = r; });
  prisma.order.findUnique = async () => ({ id: 'order', paymentStatus: status });
  prisma.order.update = async ({ data }) => { enteredUpdate(); await gate; status = data.paymentStatus; };
  const failure = verifyAndDeliver('authority', 'NOK');
  await entered;
  status = 'PAID'; // Another successful transaction commits before the stale update.
  releaseUpdate();
  await failure;
  assert.equal(status, 'FAILED');
  console.log('CONFIRMED (mocked DB interleaving): stale NOK callback overwrites PAID with FAILED');

  status = 'PENDING_REVIEW';
  prisma.order.findFirst = async () => ({ id: 'order', paymentProvider: 'CARD_TO_CARD', paymentStatus: status });
  prisma.receipt.create = async () => { status = 'PAID'; return { id: 'receipt' }; };
  prisma.order.update = async ({ data }) => { status = data.paymentStatus; };
  await uploadReceipt('owner', 'order', { buffer: Buffer.from('fake'), mimetype: 'image/png' });
  assert.equal(status, 'PENDING_REVIEW');
  console.log('CONFIRMED (mocked DB interleaving): receipt upload overwrites concurrent PAID with PENDING_REVIEW');

  const a = 'a'.repeat(72) + 'X';
  const b = 'a'.repeat(72) + 'Y';
  assert(signupSchema.safeParse({name:'test', email:'test@example.com', password:a}).success);
  assert(await bcrypt.compare(b, await bcrypt.hash(a, 4)));
  console.log('CONFIRMED: two accepted, different passwords with same first 72 bytes authenticate identically');

  const app = createApp();
  async function login(ip) {
    return inject(app, { method: 'POST', url: '/auth/login', remoteAddress: '172.20.0.5', headers: { 'x-forwarded-for': `${ip}, 198.51.100.1`, 'content-type':'application/json' }, payload: '{}' });
  }
  for (let i = 0; i < 10; i++) assert.equal((await login('203.0.113.1')).statusCode, 400);
  assert.equal((await login('203.0.113.1')).statusCode, 429);
  assert.equal((await login('203.0.113.2')).statusCode, 400);
  console.log('CONFIRMED (Express injection, direct-origin nginx header chain): forged forwarded IP bypasses auth limiter');
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exitCode = 1; });
