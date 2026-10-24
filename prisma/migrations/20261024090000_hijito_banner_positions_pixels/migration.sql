-- Convert the previous 0-100% crop positions to approximate pixel offsets.
UPDATE "HijitoTrack"
SET "bannerX" = (50 - "bannerX") * 2,
    "bannerY" = (50 - "bannerY") * 2;

ALTER TABLE "HijitoTrack" ALTER COLUMN "bannerX" SET DEFAULT 0;
ALTER TABLE "HijitoTrack" ALTER COLUMN "bannerY" SET DEFAULT 0;
