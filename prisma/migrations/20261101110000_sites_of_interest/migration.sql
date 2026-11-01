CREATE TABLE "SiteContext" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteContext_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SitePage" (
    "id" SERIAL NOT NULL,
    "contextId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "screenshot" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitePage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SiteContext_name_key" ON "SiteContext"("name");
CREATE UNIQUE INDEX "SitePage_contextId_url_key" ON "SitePage"("contextId", "url");
CREATE INDEX "SitePage_contextId_createdAt_idx" ON "SitePage"("contextId", "createdAt");

ALTER TABLE "SitePage" ADD CONSTRAINT "SitePage_contextId_fkey"
FOREIGN KEY ("contextId") REFERENCES "SiteContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;
