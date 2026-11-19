import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";
import {
  fetchNavasan,
  fxStateSchema,
  mayAttempt,
  usableFxRates,
  FX_BUDGET,
  FX_INTERVAL_MS,
  FX_MAX_AGE_MS,
  FX_WINDOW_MS,
  type FxState,
} from "./navasan";
import type { Pricing } from "./pricing";

export const FX_SETTING_KEY = "fx.navasan.free";
function parseState(value: string): FxState {
  try {
    return fxStateSchema.parse(JSON.parse(value));
  } catch {
    throw new AppError(
      503,
      "FX_STATE_INVALID",
      "Exchange rate cache requires administrator review",
    );
  }
}
async function readState() {
  const row = await prisma.siteSetting.findUnique({ where: { key: FX_SETTING_KEY } });
  return row ? parseState(row.value) : null;
}
function newState(now: Date): FxState {
  const expiry = new Date(now);
  expiry.setUTCMonth(expiry.getUTCMonth() + 3);
  return {
    createdAt: now.toISOString(),
    expiresAt: expiry.toISOString(),
    attempts: [],
    blocked: false,
    snapshot: null,
    lastError: null,
  };
}
export async function refreshNavasan() {
  const key = process.env.NAVASAN_API_KEY?.trim();
  if (!key) return;
  // Commit the quota reservation BEFORE network I/O, including failures and process crashes.
  const reserved = await prisma.$transaction(async (tx) => {
    const [lock] = await tx.$queryRaw<
      { locked: boolean }[]
    >`SELECT pg_try_advisory_xact_lock(hashtext(${FX_SETTING_KEY})) AS locked`;
    if (!lock.locked) return false;
    const row = await tx.siteSetting.findUnique({ where: { key: FX_SETTING_KEY } });
    const now = new Date(),
      state = row ? parseState(row.value) : newState(now);
    if (!mayAttempt(state, now.getTime())) return false;
    state.attempts = state.attempts.filter((t) => Date.parse(t) > now.getTime() - FX_WINDOW_MS);
    state.attempts.push(now.toISOString());
    await tx.siteSetting.upsert({
      where: { key: FX_SETTING_KEY },
      create: { key: FX_SETTING_KEY, value: JSON.stringify(state) },
      update: { value: JSON.stringify(state) },
    });
    return true;
  });
  if (!reserved) return;
  let snapshot: FxState["snapshot"] = null,
    lastError: FxState["lastError"] = null;
  try {
    snapshot = await fetchNavasan(key);
  } catch (error) {
    const code = error instanceof AppError ? error.code : "";
    lastError =
      code === "FX_AUTH"
        ? "AUTH"
        : code === "FX_LIMIT"
          ? "LIMIT"
          : code === "FX_INVALID"
            ? "INVALID"
            : "UNAVAILABLE";
  }
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${FX_SETTING_KEY}))`;
    const row = await tx.siteSetting.findUniqueOrThrow({ where: { key: FX_SETTING_KEY } });
    const state = parseState(row.value);
    if (snapshot) state.snapshot = snapshot;
    state.lastError = lastError;
    if (lastError === "AUTH") state.blocked = true;
    await tx.siteSetting.update({
      where: { key: FX_SETTING_KEY },
      data: { value: JSON.stringify(state) },
    });
  });
}
export async function fxStatus() {
  const state = await readState(),
    now = Date.now();
  return {
    source: "NAVASAN_FREE" as const,
    configured: !!process.env.NAVASAN_API_KEY?.trim(),
    snapshot: state?.snapshot ?? null,
    lastError: state?.lastError ?? null,
    blocked: state?.blocked ?? false,
    expiresAt: state?.expiresAt ?? null,
    usedLast31Days: state?.attempts.filter((t) => Date.parse(t) > now - FX_WINDOW_MS).length ?? 0,
    budget: FX_BUDGET,
    intervalHours: 8,
    nextAttemptAt: state?.attempts.length
      ? new Date(Math.max(...state.attempts.map(Date.parse)) + FX_INTERVAL_MS).toISOString()
      : null,
  };
}
export async function quotePricing(policy: Pricing) {
  const now = Date.now();
  if (policy.rateSource !== "NAVASAN_FREE")
    return {
      policy,
      fx: null,
      rateExpiresAt: Date.parse(policy.updatedAt) + policy.ttlSeconds * 1000,
    };
  const state = await readState();
  if (
    !process.env.NAVASAN_API_KEY?.trim() ||
    !state?.snapshot ||
    state.blocked ||
    Date.parse(state.expiresAt) <= now
  )
    throw new AppError(503, "PRICING_UNAVAILABLE", "Sampled exchange rate is unavailable");
  const rates = usableFxRates(state.snapshot, now);
  if (!Object.keys(rates).length)
    throw new AppError(503, "PRICING_UNAVAILABLE", "Sampled exchange rate is too old");
  const timestamps = Object.entries(state.snapshot.rates)
    .filter(([currency]) => currency in rates)
    .map(([, rate]) => Date.parse(rate.updatedAt));
  return {
    // Fresh estimate calculation time is separate from the explicitly disclosed original FX times.
    policy: { ...policy, rates, updatedAt: new Date(now).toISOString(), ttlSeconds: 60 },
    fx: {
      source: "NAVASAN_FREE" as const,
      sampled: true,
      fetchedAt: state.snapshot.fetchedAt,
      updatedAt: new Date(Math.min(...timestamps)).toISOString(),
      refreshIntervalHours: 8,
    },
    rateExpiresAt: Math.min(...timestamps) + FX_MAX_AGE_MS,
  };
}
export function startFxRefresh(): () => void {
  if (!process.env.NAVASAN_API_KEY?.trim()) return () => {};
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await refreshNavasan();
    } catch {
      console.error("[fx] refresh unavailable; private state retained");
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), 60000);
  timer.unref();
  return () => clearInterval(timer);
}
