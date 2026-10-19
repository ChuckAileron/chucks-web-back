-- CreateTable
CREATE TABLE "ShopContext" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopItem" (
    "id" SERIAL NOT NULL,
    "contextId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "imageUrl" TEXT,
    "price" DOUBLE PRECISION,
    "usdPrice" DOUBLE PRECISION,
    "currency" TEXT,
    "condition" TEXT,
    "store" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopContext_name_key" ON "ShopContext"("name");

-- CreateIndex
CREATE INDEX "ShopItem_contextId_idx" ON "ShopItem"("contextId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopItem_contextId_url_key" ON "ShopItem"("contextId", "url");

-- AddForeignKey
ALTER TABLE "ShopItem" ADD CONSTRAINT "ShopItem_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "ShopContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;
