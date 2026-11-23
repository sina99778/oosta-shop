CREATE TABLE "storefront_step_counts" (
    "day" TIMESTAMP(3) NOT NULL,
    "step" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY ("day", "step")
);
