-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL DEFAULT '',
    "year" INTEGER,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistPrice" (
    "id" SERIAL NOT NULL,
    "wishlistId" INTEGER NOT NULL,
    "store" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "currency" TEXT,
    "checkedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "WishlistPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WishlistPrice_wishlistId_idx" ON "WishlistPrice"("wishlistId");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistPrice_wishlistId_url_key" ON "WishlistPrice"("wishlistId", "url");

-- AddForeignKey
ALTER TABLE "WishlistPrice" ADD CONSTRAINT "WishlistPrice_wishlistId_fkey" FOREIGN KEY ("wishlistId") REFERENCES "WishlistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
