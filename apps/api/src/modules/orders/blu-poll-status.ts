import { open } from "node:fs/promises";
import { env } from "../../config/env";

export async function readBluPollStatus() {
  const path = env.BLU_POLL_STATUS_FILE;
  if (!path) return { state: "disabled", checkedAt: null };
  try {
    const file = await open(path, "r");
    try {
      const buffer = Buffer.alloc(128);
      const { bytesRead } = await file.read(buffer);
      const report = buffer.toString("utf8", 0, bytesRead);
      const parsed =
        /^(\d{10}) (idle|matched|pending|review|enrollmentRequired|unavailable)\n$/.exec(report);
      if (!parsed || bytesRead === buffer.length) return { state: "unavailable", checkedAt: null };
      const checked = Number(parsed[1]) * 1000;
      const age = Date.now() - checked;
      if (age < -60000) return { state: "unavailable", checkedAt: null };
      return {
        state: age > 600000 ? "stale" : parsed[2],
        checkedAt: new Date(checked).toISOString(),
      };
    } finally {
      await file.close();
    }
  } catch (error) {
    return {
      state: (error as NodeJS.ErrnoException).code === "ENOENT" ? "waiting" : "unavailable",
      checkedAt: null,
    };
  }
}
