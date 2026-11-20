import assert from "node:assert/strict";
import { inject } from "light-my-request";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { signAccessToken } from "../src/lib/jwt";
import { CART_LIFETIME, releaseExpiredCart } from "../src/modules/orders/cart-state";
import { reconcileOnlineCartPayments } from "../src/modules/orders/cart-payment-recovery";
import { deliverOrder, uploadReceipt } from "../src/modules/orders/orders.service";

async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1");
  assert(!env.TELEGRAM_BOT_TOKEN);
  env.BLU_STOCK_CHECKOUT_ENABLED = false;
  process.env.OOSTA_DISCOUNT_CODES = "CARTTEST:10";
  for (const [name, value] of Object.entries({
    cardEnabled: "true",
    cardNumber: "1234567890123456",
    cardHolder: "Synthetic",
  })) {
    const key = "pay." + name;
    await prisma.siteSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  const app = createApp();
  const [buyer, other, admin] = await Promise.all(
    ["USER", "USER", "ADMIN"].map((role, index) =>
      prisma.user.create({
        data: {
          name: "Cart test " + index,
          passwordHash: "unused",
          role: role as "USER" | "ADMIN",
        },
      }),
    ),
  );
  const category = await prisma.category.create({ data: { name: "Cart test", slug: "cart-test" } });
  const product = await prisma.product.create({
    data: {
      name: "Cart test",
      slug: "cart-test",
      description: "Fixture",
      type: "LICENSE",
      categoryId: category.id,
    },
  });
  const plans = await Promise.all(
    [2000000, 3000000, 4000000].map(async (price) => {
      const plan = await prisma.productPlan.create({
        data: { label: "Fixture", price, productId: product.id },
      });
      await prisma.inventoryItem.create({
        data: {
          productId: product.id,
          planId: plan.id,
          type: "LICENSE",
          licenseKey: "CART-PRIVATE-STOCK",
        },
      });
      return plan;
    }),
  );
  const call = (method: "GET" | "POST" | "DELETE", url: string, payload?: unknown, who = buyer) =>
    inject(app, {
      url,
      method,
      payload,
      headers: { authorization: "Bearer " + signAccessToken({ sub: who.id, role: who.role }) },
    });
  const add = (planId: string, who = buyer) => call("POST", "/cart/items", { planId }, who);
  const getId = (response: Awaited<ReturnType<typeof add>>) => {
    assert.equal(response.statusCode, 201, response.body);
    return response.json<{ id: string; expiresAt: string }>();
  };

  assert.equal((await inject(app, { method: "GET", url: "/cart" })).statusCode, 401);
  assert.equal((await inject(app, { method: "GET", url: "/cart/count" })).statusCode, 401);
  assert.equal((await add(plans[0].id, admin)).statusCode, 403);
  const first = getId(await add(plans[0].id));
  const second = getId(await add(plans[1].id));
  const expires = getId(await add(plans[2].id));
  assert(Date.parse(first.expiresAt) - Date.now() > CART_LIFETIME - 30000);
  assert.equal(getId(await add(plans[0].id)).expiresAt, first.expiresAt);
  const path = "/cart/items/" + first.id;
  assert.equal((await call("DELETE", path, undefined, other)).statusCode, 404);
  assert.equal((await call("POST", path + "/review", {}, other)).statusCode, 404);
  assert.equal((await call("GET", "/cart", undefined, other)).json().lines.length, 0);

  const otherFirst = getId(await add(plans[0].id, other));
  const count = await call("GET", "/cart/count");
  assert.deepEqual(count.json(), { count: 3 });
  assert.match(String(count.headers["cache-control"]), /no-store/);
  assert.equal(
    await prisma.inventoryItem.count({ where: { planId: plans[0].id, status: "AVAILABLE" } }),
    1,
    "a saved cart must not hold the only unit",
  );
  assert.equal(
    (await call("DELETE", "/cart/items/" + otherFirst.id, undefined, other)).statusCode,
    204,
  );

  await prisma.cartLine.update({ where: { id: expires.id }, data: { expiresAt: new Date(0) } });
  await releaseExpiredCart();
  const otherItem = getId(await add(plans[2].id, other));
  const breakdown = { extraIds: [second.id], code: "CARTTEST" };
  assert.equal(
    (await call("POST", path + "/review", { extraIds: [otherItem.id] })).statusCode,
    404,
  );
  assert.equal(
    (await call("POST", path + "/review", { code: "WRONG" })).json().error.code,
    "INVALID_DISCOUNT_CODE",
  );
  const review = await call("POST", path + "/review", breakdown);
  assert.equal(review.statusCode, 200, review.body);
  assert.equal(review.json().invoice.total, "4500000");
  const payment = {
    ...breakdown,
    method: "card_to_card",
    subtotal: "5000000",
    total: "4500000",
    revision: review.json().invoice.revision,
  };
  assert.equal((await call("POST", path + "/pay", payment, other)).statusCode, 404);
  assert.equal((await call("POST", path + "/pay", { ...payment, total: "1" })).statusCode, 409);

  await prisma.productPlan.update({ where: { id: plans[0].id }, data: { price: 3000000 } });
  await prisma.productPlan.update({ where: { id: plans[1].id }, data: { price: 2000000 } });
  const cart = await call("GET", "/cart");
  assert.match(String(cart.headers["cache-control"]), /private.*no-store/);
  assert(!cart.body.includes("CART-PRIVATE-STOCK"));
  assert.equal(
    cart.json().lines.find((line: { id: string }) => line.id === first.id).notice,
    "PRICE_INCREASE",
  );
  assert.equal((await call("POST", path + "/pay", payment)).json().error.code, "CART_CHANGED");
  await prisma.productPlan.update({ where: { id: plans[1].id }, data: { isActive: false } });
  assert.equal((await call("POST", path + "/review", breakdown)).json().error.code, "OUT_OF_STOCK");
  await prisma.productPlan.update({ where: { id: plans[1].id }, data: { isActive: true } });
  const fresh = (await call("POST", path + "/review", breakdown)).json().invoice;
  payment.revision = fresh.revision;
  const rivalLine = getId(await add(plans[0].id, other));
  const rivalPath = "/cart/items/" + rivalLine.id;
  const rivalReview = (await call("POST", rivalPath + "/review", {}, other)).json().invoice;
  const results = await Promise.all([
    call("POST", path + "/pay", payment),
    call("POST", path + "/pay", payment),
  ]);
  for (const result of results) assert.equal(result.statusCode, 201, result.body);
  const id = results[0].json().order.id;
  assert.equal(results[1].json().order.id, id);
  assert.equal(
    (
      await call(
        "POST",
        rivalPath + "/pay",
        {
          method: "card_to_card",
          revision: rivalReview.revision,
          subtotal: rivalReview.subtotal,
          total: rivalReview.total,
        },
        other,
      )
    ).json().error.code,
    "OUT_OF_STOCK",
  );
  const order = await prisma.order.findUniqueOrThrow({
    where: { id },
    include: { items: { include: { fulfilledItems: true } } },
  });
  assert.equal(order.items.length, 2);
  assert(order.items.every((item) => item.fulfilledItems[0]?.status === "RESERVED"));
  assert(order.items[0].lineTotal.add(order.items[1].lineTotal).eq(order.totalAmount));
  const detail = await call("GET", "/orders/" + id);
  assert.equal(detail.json().order.cardToCard.number, "1234567890123456");
  assert.equal((await call("GET", "/orders/" + id, undefined, other)).statusCode, 404);
  const spare = await prisma.inventoryItem.create({
    data: { productId: product.id, planId: plans[0].id, type: "LICENSE" },
  });
  const addWhileOpen = await add(plans[0].id);
  assert.equal(addWhileOpen.statusCode, 409);
  assert.equal(addWhileOpen.json().error.code, "ORDER_IN_PROGRESS");
  assert.equal((await prisma.cartLine.findUniqueOrThrow({ where: { id: first.id } })).orderId, id);
  await prisma.inventoryItem.delete({ where: { id: spare.id } });
  await prisma.cartLine.update({ where: { id: first.id }, data: { expiresAt: new Date(0) } });
  await releaseExpiredCart();
  assert.equal((await call("POST", path + "/pay", payment)).json().order.id, id);
  const proof = { mimetype: "image/png", buffer: Buffer.from("synthetic") };
  await assert.rejects(uploadReceipt(buyer.id, id, proof), { code: "BLU_REFERENCE_REQUIRED" });
  await releaseExpiredCart(new Date(Date.parse(first.expiresAt) + 1000));
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id } })).paymentStatus, "EXPIRED");
  assert.equal(
    await prisma.inventoryItem.count({
      where: { planId: { in: plans.slice(0, 2).map(({ id }) => id) }, status: "AVAILABLE" },
    }),
    2,
  );
  console.log(
    "PASS: cart ownership, 24-hour cart lifetime, stock claims at checkout, grouped invoices, discounts, stale prices and exactly-once order creation",
  );
  const privatePlan = await prisma.productPlan.create({
    data: { productId: product.id, label: "Private CapCut fixture", price: 10050, isActive: false },
  });
  const privateUnit = await prisma.inventoryItem.create({
    data: {
      productId: product.id,
      planId: privatePlan.id,
      type: "LICENSE",
      licenseKey: "SYNTHETIC-PRIVATE-PILOT",
    },
  });
  await prisma.siteSetting.create({
    data: {
      key: "checkout.privateStock",
      value: JSON.stringify({ planId: privatePlan.id, userId: buyer.id }),
    },
  });
  const publicProduct = await call("GET", "/products/" + product.slug);
  assert(!publicProduct.body.includes(privatePlan.id));
  assert(!(await call("GET", "/site-settings")).body.includes(privatePlan.id));
  assert.equal((await add(privatePlan.id, other)).statusCode, 409);
  const privateItem = getId(await add(privatePlan.id, buyer));
  const privatePath = "/cart/items/" + privateItem.id;
  assert.equal((await call("POST", privatePath + "/review", {}, other)).statusCode, 404);
  assert(!(await call("GET", "/cart")).body.includes("SYNTHETIC-PRIVATE-PILOT"));
  const privateReview = await call("POST", privatePath + "/review", {}, buyer);
  assert.equal(privateReview.statusCode, 200, privateReview.body);
  const privateInvoice = privateReview.json().invoice;
  assert.equal(privateInvoice.total, "10050");
  assert.deepEqual(privateInvoice.methods, { online: false, cardToCard: true });
  const privatePayment = {
    total: privateInvoice.total,
    subtotal: privateInvoice.subtotal,
    revision: privateInvoice.revision,
    method: "card_to_card",
  };
  assert.equal((await call("POST", privatePath + "/pay", privatePayment, other)).statusCode, 404);
  const privatePaid = await call("POST", privatePath + "/pay", privatePayment, buyer);
  assert.equal(privatePaid.statusCode, 201, privatePaid.body);
  const privateOrder = privatePaid.json().order.id;
  const privateReady = await call("GET", "/orders/" + privateOrder);
  assert.equal(privateReady.json().order.paymentStatus, "PENDING");
  assert(!privateReady.body.includes("SYNTHETIC-PRIVATE-PILOT"));
  const privateReceipt = await uploadReceipt(buyer.id, privateOrder, proof, "12345678");
  assert.equal(
    (await call("POST", "/admin/receipts/" + privateReceipt.receiptId + "/approve", {}, admin))
      .statusCode,
    200,
  );
  assert((await call("GET", "/orders/" + privateOrder)).body.includes("SYNTHETIC-PRIVATE-PILOT"));
  assert.equal((await call("GET", "/orders/" + privateOrder, undefined, other)).statusCode, 404);
  assert.equal(
    (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: privateUnit.id } })).status,
    "SOLD",
  );
  assert.equal((await add(privatePlan.id, buyer)).statusCode, 409);
  console.log(
    "PASS: hidden pre-purchased unit through the bound buyer cart, real checkout endpoints and private receipt-to-delivery lifecycle",
  );
  const registration = await inject(app, {
    method: "POST",
    url: "/auth/signup",
    payload: {
      name: "Welcome test",
      email: "welcome-cart@example.invalid",
      password: "Synthetic-1234",
    },
  });
  assert.equal(registration.statusCode, 201, registration.body);
  const { user, token } = registration.json();
  assert(!registration.body.includes("WELCOME-"));
  const inboxCall = () =>
    inject(app, {
      method: "GET",
      url: "/auth/inbox",
      headers: { authorization: "Bearer " + token },
    });
  assert.equal((await inject(app, { method: "GET", url: "/auth/inbox" })).statusCode, 401);
  const inbox = await inboxCall();
  assert.equal(inbox.statusCode, 200, inbox.body);
  assert.match(String(inbox.headers["cache-control"]), /no-store/);
  const gift = inbox.json().welcomeGift;
  assert.match(gift.code, /^WELCOME-[A-F0-9]{24}$/);
  assert.equal(gift.percent, 15);
  assert.equal((await call("GET", "/auth/inbox", undefined, other)).json().welcomeGift, null);
  const firstGiftItem = getId(await add(plans[0].id, user));
  const secondGiftItem = getId(await add(plans[1].id, user));
  const giftPath = (id: string) => "/cart/items/" + id;
  const otherPath = giftPath(getId(await add(plans[2].id, other)).id);
  const onlinePlan = await prisma.productPlan.create({
    data: { productId: product.id, label: "Synthetic online", price: 2000000 },
  });
  const onlineUnit = await prisma.inventoryItem.create({
    data: { productId: product.id, planId: onlinePlan.id, type: "LICENSE" },
  });
  const onlineItem = getId(await add(onlinePlan.id, user));
  const onlinePath = giftPath(onlineItem.id);
  const realFetch = globalThis.fetch;
  let fetchFailed = false;
  try {
    for (const [key, value] of [
      ["pay.provider", "zarinpal"],
      ["pay.zarinpalMerchantId", "11111111-1111-4111-8111-111111111111"],
    ])
      await prisma.siteSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    globalThis.fetch = async (input) => {
      assert.match(
        String(input),
        /^https:\/\/sandbox\.zarinpal\.com\/pg\/v4\/payment\/request\.json$/,
      );
      fetchFailed = true;
      throw new Error("synthetic timeout after initialization request");
    };
    const { invoice } = (
      await call("POST", onlinePath + "/review", { code: gift.code }, user)
    ).json();
    const failed = await call(
      "POST",
      onlinePath + "/pay",
      {
        method: "online",
        code: gift.code,
        subtotal: invoice.subtotal,
        total: invoice.total,
        revision: invoice.revision,
      },
      user,
    );
    assert.equal(failed.statusCode, 502, failed.body);
    assert(fetchFailed);
    assert.equal((await inboxCall()).json().welcomeGift.state, "AVAILABLE");
    assert.equal(
      (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: onlineUnit.id } })).status,
      "AVAILABLE",
    );
    assert.equal(
      (await prisma.cartLine.findUniqueOrThrow({ where: { id: onlineItem.id } })).orderId,
      null,
    );
    let gatewayState = "IN_BANK";
    let nextSession = 0;
    let inquiries = 0;
    globalThis.fetch = async (input, init) => {
      const path = new URL(String(input)).pathname;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.merchant_id, "11111111-1111-4111-8111-111111111111");
      if (path.endsWith("/request.json"))
        return Response.json({
          data: { code: 100, authority: "A" + String(++nextSession).padStart(35, "0") },
        });
      if (path.endsWith("/inquiry.json")) {
        inquiries++;
        if (gatewayState === "INVALID")
          return Response.json(
            { errors: { authority: ["Invalid authority.", "-54"] } },
            { status: 400 },
          );
        return Response.json({ data: { code: 100, status: gatewayState } });
      }
      assert(path.endsWith("/verify.json"));
      return Response.json({ data: { code: 100, ref_id: 7788 } });
    };
    const startOnline = async (code?: string) => {
      const { invoice } = (await call("POST", onlinePath + "/review", { code }, user)).json();
      const response = await call(
        "POST",
        onlinePath + "/pay",
        {
          method: "online",
          code,
          subtotal: invoice.subtotal,
          total: invoice.total,
          revision: invoice.revision,
        },
        user,
      );
      assert.equal(response.statusCode, 201, response.body);
      return response.json().order.id as string;
    };
    const expiry = new Date(Date.now() + 31 * 60_000);
    const abandonedOnline = await startOnline(gift.code);
    await reconcileOnlineCartPayments(expiry);
    assert.equal(
      (await prisma.order.findUniqueOrThrow({ where: { id: abandonedOnline } })).paymentStatus,
      "PENDING",
    );
    assert.equal(
      (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: onlineUnit.id } })).status,
      "RESERVED",
    );
    const abandonedSession = await prisma.order.findUniqueOrThrow({
      where: { id: abandonedOnline },
    });
    await call(
      "POST",
      "/payments/verify",
      { authority: abandonedSession.paymentAuthority, status: "NOK" },
      user,
    );
    await reconcileOnlineCartPayments();
    assert.equal(
      (await prisma.order.findUniqueOrThrow({ where: { id: abandonedOnline } })).paymentStatus,
      "FAILED",
      "NOK cannot release an in-bank payment",
    );
    gatewayState = "FAILED";
    await reconcileOnlineCartPayments();
    assert.equal(
      (await prisma.order.findUniqueOrThrow({ where: { id: abandonedOnline } })).paymentStatus,
      "EXPIRED",
    );
    assert.equal((await inboxCall()).json().welcomeGift.state, "AVAILABLE");
    assert.equal(
      (await prisma.cartLine.findUniqueOrThrow({ where: { id: onlineItem.id } })).orderId,
      null,
    );
    const onlineBuyer = await prisma.user.create({
      data: { name: "Synthetic gateway buyer", passwordHash: "unused" },
    });
    const onlinePurchase = getId(await add(onlinePlan.id, onlineBuyer));
    const onlinePurchasePath = giftPath(onlinePurchase.id);
    const paidReview = (await call("POST", onlinePurchasePath + "/review", {}, onlineBuyer)).json()
      .invoice;
    const startPurchase = () =>
      call(
        "POST",
        onlinePurchasePath + "/pay",
        {
          method: "online",
          subtotal: paidReview.subtotal,
          total: paidReview.total,
          revision: paidReview.revision,
        },
        onlineBuyer,
      );
    const late = await startPurchase();
    assert.equal(late.statusCode, 201, late.body);
    await reconcileOnlineCartPayments(expiry);
    const lateOrder = await prisma.order.findUniqueOrThrow({ where: { id: late.json().order.id } });
    assert.equal(lateOrder.paymentStatus, "EXPIRED");
    const willPay = await startPurchase();
    assert.equal(willPay.statusCode, 201, willPay.body);
    gatewayState = "PAID";
    await reconcileOnlineCartPayments(expiry);
    assert.equal(
      (await prisma.order.findUniqueOrThrow({ where: { id: willPay.json().order.id } }))
        .paymentStatus,
      "PAID",
    );
    assert.equal(
      (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: onlineUnit.id } })).status,
      "SOLD",
    );
    assert.equal(await deliverOrder(willPay.json().order.id, "7788"), false);
    const retry = await startPurchase();
    assert.equal(retry.statusCode, 201);
    assert.equal(retry.json().order.paymentStatus, "PAID");
    assert.equal(retry.json().payment, undefined);
    for (let index = 0; index < 2; index++) {
      const response = await call(
        "POST",
        "/payments/verify",
        {
          authority: lateOrder.paymentAuthority,
          status: "OK",
        },
        onlineBuyer,
      );
      assert.deepEqual(response.json(), { status: "pending", orderId: lateOrder.id });
    }
    assert.equal(
      await prisma.inventoryItem.count({ where: { orderItem: { orderId: lateOrder.id } } }),
      0,
    );
    await prisma.inventoryItem.create({
      data: { productId: product.id, planId: onlinePlan.id, type: "LICENSE" },
    });
    const reviewItem = getId(await add(onlinePlan.id, onlineBuyer));
    const reviewPath = giftPath(reviewItem.id);
    const reviewInvoice = (await call("POST", reviewPath + "/review", {}, onlineBuyer)).json().invoice;
    const reviewStart = await call("POST", reviewPath + "/pay", {
      method: "online",
      subtotal: reviewInvoice.subtotal,
      total: reviewInvoice.total,
      revision: reviewInvoice.revision,
    }, onlineBuyer);
    assert.equal(reviewStart.statusCode, 201, reviewStart.body);
    const reviewOrder = reviewStart.json().order.id;
    gatewayState = "INVALID";
    const reviewCutoff = new Date(expiry.getTime() + CART_LIFETIME);
    await reconcileOnlineCartPayments(reviewCutoff);
    const needsReview = await prisma.order.findUniqueOrThrow({ where: { id: reviewOrder } });
    assert.equal(needsReview.paymentStatus, "PENDING");
    assert.equal(
      (needsReview.paymentMetadata as { paymentReviewRequired?: boolean }).paymentReviewRequired,
      true,
    );
    const previousInquiries = inquiries;
    await reconcileOnlineCartPayments(reviewCutoff);
    assert.equal(inquiries, previousInquiries, "manual reconciliation must stop automated inquiry");
    console.log(
      "PASS: scoped online gateway outage, early confirmed cancellation, stock and gift release, expired session review and recovered payment without a callback",
    );
  } finally {
    globalThis.fetch = realFetch;
    await prisma.siteSetting.deleteMany({
      where: { key: { in: ["pay.provider", "pay.zarinpalMerchantId"] } },
    });
  }
  assert.equal(
    (await call("POST", otherPath + "/review", { code: gift.code }, other)).json().error.code,
    "INVALID_DISCOUNT_CODE",
  );
  const abandoned = await prisma.order.create({
    data: {
      userId: user.id,
      totalAmount: 9999,
      paymentProvider: "CARD_TO_CARD",
      welcomeGift: true,
      paymentMetadata: {
        manualSupplier: true,
        expiresAt: new Date(Date.now() - CART_LIFETIME - 1000).toISOString(),
      },
    },
  });
  assert.equal((await inboxCall()).json().welcomeGift.state, "RESERVED");
  await releaseExpiredCart();
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: abandoned.id } })).paymentStatus,
    "EXPIRED",
  );
  assert.equal((await inboxCall()).json().welcomeGift.state, "AVAILABLE");
  const discounts = await Promise.all(
    [firstGiftItem, secondGiftItem].map(async (item) => {
      const result = await call("POST", giftPath(item.id) + "/review", { code: gift.code }, user);
      assert.equal(result.statusCode, 200, result.body);
      const invoice = result.json().invoice;
      assert.equal(Number(invoice.discount), Number(invoice.subtotal) * 0.15);
      return invoice;
    }),
  );
  const giftPayments = await Promise.all(
    discounts.map(({ id, total, subtotal, revision }) =>
      call(
        "POST",
        giftPath(id) + "/pay",
        { method: "card_to_card", code: gift.code, total, subtotal, revision },
        user,
      ),
    ),
  );
  assert.deepEqual(giftPayments.map((r) => r.statusCode).sort(), [201, 409]);
  const winning = giftPayments.find((r) => r.statusCode === 201)!.json().order.id;
  const losing = discounts[giftPayments.findIndex((r) => r.statusCode === 409)].id;
  assert.equal((await inboxCall()).json().welcomeGift.state, "RESERVED");
  const losingPlan = plans[losing === firstGiftItem.id ? 0 : 1].id;
  await prisma.inventoryItem.create({
    data: {
      productId: product.id,
      planId: losingPlan,
      type: "LICENSE",
      licenseKey: "CART-SYNTHETIC-SPARE",
    },
  });
  const pending = await call(
    "POST",
    "/orders",
    { items: [{ planId: losingPlan, quantity: 1 }], method: "card_to_card" },
    user,
  );
  assert.equal(pending.json().error.code, "WELCOME_GIFT_PENDING");
  const receipt = await uploadReceipt(user.id, winning, proof, "123456");
  const approved = await call(
    "POST",
    "/admin/receipts/" + receipt.receiptId + "/approve",
    {},
    admin,
  );
  assert.equal(approved.statusCode, 200, approved.body);
  assert.equal((await inboxCall()).json().welcomeGift.state, "USED");
  assert.equal(
    (await call("POST", giftPath(losing) + "/review", { code: gift.code }, user)).json().error.code,
    "WELCOME_GIFT_USED",
  );
  console.log(
    "PASS: private signup welcome gift, 15 percent, owner-only use, concurrent checkout and single redemption",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
