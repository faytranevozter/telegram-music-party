ALTER TABLE "Feature" ADD COLUMN "requesterDisplay" TEXT NOT NULL DEFAULT 'hidden';
ALTER TABLE "Queue" ADD COLUMN "requesterDisplayName" TEXT;
