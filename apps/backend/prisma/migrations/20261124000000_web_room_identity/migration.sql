BEGIN;

ALTER TABLE "Room"
    ALTER COLUMN "chatId" DROP NOT NULL,
    ADD COLUMN "shareCode" TEXT,
    ADD COLUMN "ownerUserRef" TEXT;
CREATE UNIQUE INDEX "Room_shareCode_key" ON "Room"("shareCode");

UPDATE "Vote" SET "userId" = 'telegram:' || "userId"
WHERE "userId" ~ '^[0-9]+$';
UPDATE "SongRequest" SET "requesterId" = 'telegram:' || "requesterId"
WHERE "requesterId" ~ '^[0-9]+$';

COMMIT;
