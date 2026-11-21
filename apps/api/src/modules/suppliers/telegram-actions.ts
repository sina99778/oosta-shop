import { randomBytes } from "node:crypto";
import { Markup, type Context, type Telegraf } from "telegraf";
import { AppError } from "../../utils/httpError";
import {
  dispatchManualSupplier,
  manualSupplierWalletSnapshot,
  type SupplierRegistry,
} from "./fulfillment";

type Snapshot = Awaited<ReturnType<typeof manualSupplierWalletSnapshot>>;
type Confirmation = Pick<Snapshot, "id" | "reference" | "currency"> & {
  actor: string;
  cost: string;
  expiresAt: number;
};

const statusCopy: Partial<Record<Snapshot["state"], string>> = {
  DELIVERED: "خرید و تحویل انجام شد.",
  PENDING: "خرید ثبت شد و تأمین‌کننده هنوز در حال تحویل است.",
  SENDING: "درخواست خرید در حال پردازش است.",
  READY: "خرید در صف اجراست.",
  REVIEW: "سفارش نیاز به بررسی در پنل دارد.",
  UNCERTAIN: "نتیجهٔ برداشت نامشخص است. وضعیت را در پنل بررسی کن.",
};
const blocks = {
  PRICE: "قیمت فعلی قابل بررسی نیست. دوباره تلاش کن.",
  WALLET: "موجودی برای ارز این سفارش قابل تأیید نیست.",
  BUDGET: "سقف مجاز این کیف پول، اعتبار فعلی یا وضعیت رزرو را در پنل بررسی کن.",
};
const clean = (text: string) =>
  text
    .replace(/[\s\u202a-\u202e\u2066-\u2069]+/g, " ")
    .trim()
    .slice(0, 180);

export function registerSupplierTelegram(
  bot: Telegraf,
  chatId: number,
  registry: () => SupplierRegistry,
) {
  const actorId = () => process.env.SUPPLIER_TELEGRAM_ADMIN_USER_ID ?? "";
  const confirmations = new Map<string, Confirmation>();
  function issue(snapshot: Snapshot, actor: string) {
    const now = Date.now();
    for (const [key, value] of confirmations) {
      if (value.expiresAt <= now || value.id === snapshot.id) confirmations.delete(key);
    }
    if (confirmations.size >= 100) {
      const oldest = confirmations.keys().next().value;
      if (oldest) confirmations.delete(oldest);
    }
    const token = randomBytes(12).toString("base64url");
    confirmations.set(token, {
      id: snapshot.id,
      reference: snapshot.reference,
      currency: snapshot.currency,
      actor,
      cost: snapshot.cost!.toString(),
      expiresAt: now + 120_000,
    });
    return token;
  }

  function card(snapshot: Snapshot, actor: string, allowConfirmation = false, note = "") {
    const {
      id,
      orderId,
      product,
      plan,
      supplier,
      currency,
      approved,
      cost,
      wallet,
      budget,
      shortfall,
      blocked,
      state,
    } = snapshot;
    const lines = [
      "سفارش تأمین‌کننده #" + orderId.slice(-8),
      [clean(product), clean(plan)].filter(Boolean).join(" · "),
      "تأمین‌کننده: " + supplier,
    ];
    if (state !== "AWAITING_FUNDS")
      return {
        text: [...lines, statusCopy[state] ?? "وضعیت سفارش را در پنل بررسی کن."].join("\n"),
        markup: Markup.inlineKeyboard([]),
      };
    const amount = (value: { toString(): string } | null) =>
      value === null ? "نامشخص" : value.toString() + " " + currency;
    lines.push(
      "هزینهٔ فعلی: " + amount(cost),
      "آخرین مبلغ مصوب: " + amount(approved),
      "موجودی کیف پول: " + amount(wallet),
      "کسری موجودی: " + amount(shortfall),
      "ماندهٔ سقف مجاز خرید: " + amount(budget),
    );
    if (blocked) lines.push(blocks[blocked]);
    if (note) lines.push(note);
    const refresh = Markup.button.callback("بررسی دوبارهٔ موجودی", "supplier_refresh_" + id);
    const rows = [[refresh]];
    if (allowConfirmation && !blocked && shortfall?.isZero() && cost?.gt(approved)) {
      lines.push("قیمت افزایش یافته. برای خرید همین مبلغ را تا دو دقیقه تأیید کن.");
      rows.unshift([
        Markup.button.callback(
          "تأیید خرید با " + amount(cost),
          "supplier_price_" + issue(snapshot, actor),
        ),
      ]);
    } else if (!blocked || shortfall?.gt(0)) {
      rows.unshift([
        Markup.button.callback(
          shortfall?.gt(0) ? "شارژ کردم، بررسی و خرید" : "خرید و تحویل",
          "supplier_buy_" + id,
        ),
      ]);
    }
    return { text: lines.join("\n"), markup: Markup.inlineKeyboard(rows) };
  }

  async function refreshCard(
    ctx: Context,
    snapshot: Snapshot,
    actor: string,
    allowConfirmation: boolean,
    note?: string,
  ) {
    const { text, markup } = card(snapshot, actor, allowConfirmation, note);
    try {
      await ctx.editMessageText(text, markup);
    } catch (error) {
      if (!(error instanceof Error && error.message.includes("message is not modified")))
        await ctx.reply(text, markup);
    }
  }

  async function showResult(
    ctx: Context,
    snapshot: Snapshot,
    actor: string,
    adapters: SupplierRegistry,
    state: Snapshot["state"],
  ) {
    if (state === "AWAITING_FUNDS") {
      const current = await manualSupplierWalletSnapshot({ id: snapshot.id }, actor, adapters);
      await refreshCard(ctx, current, actor, false, "تحویل هنوز انجام نشده است.");
      return;
    }
    await refreshCard(ctx, { ...snapshot, state }, actor, false);
  }

  bot.action(/^supplier_(buy|refresh)_([a-z0-9]{1,44})$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const [action, id] = ctx.match.slice(1, 3);
    const actor = actorId();
    const adapters = registry();
    try {
      const snapshot = await manualSupplierWalletSnapshot({ id }, actor, adapters);
      if (
        action === "refresh" ||
        snapshot.state !== "AWAITING_FUNDS" ||
        snapshot.blocked ||
        !snapshot.shortfall?.isZero() ||
        snapshot.cost?.gt(snapshot.approved)
      ) {
        await refreshCard(ctx, snapshot, actor, action === "buy");
        return;
      }
      const result = await dispatchManualSupplier(id, actor, adapters);
      await showResult(ctx, snapshot, actor, adapters, result.state);
    } catch (error) {
      if (error instanceof AppError && error.code === "SUPPLIER_COST_INCREASED") {
        const snapshot = await manualSupplierWalletSnapshot({ id }, actor, adapters).catch(
          () => null,
        );
        if (snapshot) {
          await refreshCard(ctx, snapshot, actor, true);
          return;
        }
      }
      await ctx.reply("خرید تأیید نشد. وضعیت سفارش را در پنل بررسی کن.");
    }
  });

  bot.action(/^supplier_price_([a-zA-Z0-9_-]{16})$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const token = ctx.match[1];
    const confirmation = confirmations.get(token);
    const actor = actorId();
    if (!confirmation || confirmation.actor !== actor || confirmation.expiresAt <= Date.now()) {
      if (confirmation?.expiresAt && confirmation.expiresAt <= Date.now())
        confirmations.delete(token);
      await ctx.reply("این تأیید معتبر نیست. موجودی و قیمت را دوباره بررسی کن.");
      return;
    }
    confirmations.delete(token);
    const { id, reference, currency, cost } = confirmation;
    const adapters = registry();
    try {
      const snapshot = await manualSupplierWalletSnapshot({ id }, actor, adapters);
      if (
        snapshot.state !== "AWAITING_FUNDS" ||
        snapshot.reference !== reference ||
        snapshot.currency !== currency ||
        !snapshot.cost?.eq(cost) ||
        snapshot.blocked ||
        !snapshot.shortfall?.isZero()
      ) {
        await refreshCard(ctx, snapshot, actor, true, "وضعیت یا قیمت پس از تأیید تغییر کرده است.");
        return;
      }
      const result = await dispatchManualSupplier(id, actor, adapters, cost, {
        reference,
        currency,
      });
      await showResult(ctx, snapshot, actor, adapters, result.state);
    } catch (error) {
      if (error instanceof AppError && error.code === "SUPPLIER_PRICE_CHANGED") {
        const snapshot = await manualSupplierWalletSnapshot({ id }, actor, adapters).catch(
          () => null,
        );
        if (snapshot) {
          await refreshCard(ctx, snapshot, actor, true, "قیمت پس از تأیید تغییر کرده است.");
          return;
        }
      }
      await ctx.reply("خرید تأیید نشد. وضعیت سفارش را در پنل بررسی کن.");
    }
  });

  return async (orderId: string) => {
    const actor = actorId();
    const snapshot = await manualSupplierWalletSnapshot({ orderId }, actor, registry());
    if (snapshot.state !== "AWAITING_FUNDS") return;
    const { text, markup } = card(snapshot, actor);
    await bot.telegram.sendMessage(chatId, text, markup);
  };
}
