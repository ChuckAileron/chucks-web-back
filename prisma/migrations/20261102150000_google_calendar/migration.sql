-- AlterTable
ALTER TABLE "CalendarEvent"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'local',
ADD COLUMN "googleEventId" TEXT,
ADD COLUMN "googleCalendarId" TEXT;

-- CreateTable
CREATE TABLE "GoogleCalendarConnection" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "email" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '',
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_googleCalendarId_googleEventId_key" ON "CalendarEvent"("googleCalendarId", "googleEventId");

-- CreateIndex
CREATE INDEX "CalendarEvent_source_googleCalendarId_idx" ON "CalendarEvent"("source", "googleCalendarId");
