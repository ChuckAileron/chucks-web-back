ALTER TABLE "AuthUser"
ADD COLUMN "passwordResetToken" TEXT,
ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3),
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "AuthUser_passwordResetToken_key"
ON "AuthUser"("passwordResetToken");
