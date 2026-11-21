import type { RequestHandler } from "express";

let maintenance = false;
let active = 0;
export const isMaintenance = () => maintenance;

// Work committed by an accepted HTTP request may keep using the database after its response.
export async function trackMaintenanceWork<T>(run: () => Promise<T>): Promise<T> {
  active++;
  try {
    return await run();
  } finally {
    active--;
  }
}

export const maintenanceGate: RequestHandler = (req, res, next) => {
  if (req.path.startsWith("/health")) {
    next();
    return;
  }
  if (maintenance) {
    res.status(503).json({
      error: {
        code: "MAINTENANCE",
        message: "Database maintenance is in progress. Please retry shortly.",
      },
    });
    return;
  }
  active++;
  let finished = false;
  const finish = () => {
    if (!finished) {
      finished = true;
      active--;
    }
  };
  res.once("finish", finish);
  res.once("close", finish);
  next();
};
export async function beginMaintenance(): Promise<void> {
  if (maintenance) throw new Error("A restore is already in progress");
  maintenance = true;
  const deadline = Date.now() + 30000;
  while (active > 0) {
    if (Date.now() >= deadline) {
      maintenance = false;
      throw new Error("Active requests did not finish; restore cancelled");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
export function endMaintenance() {
  maintenance = false;
}
