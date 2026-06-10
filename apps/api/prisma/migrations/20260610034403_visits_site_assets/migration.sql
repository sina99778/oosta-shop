-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT '??',
    "visitorHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_assets" (
    "key" TEXT NOT NULL,
    "imageData" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_assets_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "visits_createdAt_idx" ON "visits"("createdAt");

-- CreateIndex
CREATE INDEX "visits_country_createdAt_idx" ON "visits"("country", "createdAt");
