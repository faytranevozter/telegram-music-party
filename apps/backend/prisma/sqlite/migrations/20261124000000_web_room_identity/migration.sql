-- Prevent cascades while replacing the parent table. This must precede BEGIN.
PRAGMA foreign_keys=OFF;
BEGIN;

CREATE TABLE "new_Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT,
    "threadId" INTEGER,
    "name" TEXT NOT NULL,
    "shareCode" TEXT,
    "ownerUserRef" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Room" ("id", "chatId", "threadId", "name", "createdAt", "updatedAt")
SELECT "id", "chatId", "threadId", "name", "createdAt", "updatedAt" FROM "Room";
DROP TABLE "Room";
ALTER TABLE "new_Room" RENAME TO "Room";
CREATE UNIQUE INDEX "Room_id_key" ON "Room"("id");
CREATE UNIQUE INDEX "Room_chatId_threadId_key" ON "Room"("chatId", "threadId");
CREATE UNIQUE INDEX "Room_shareCode_key" ON "Room"("shareCode");

UPDATE "Vote" SET "userId" = 'telegram:' || "userId"
WHERE "userId" <> '' AND "userId" NOT GLOB '*[^0-9]*';
UPDATE "SongRequest" SET "requesterId" = 'telegram:' || "requesterId"
WHERE "requesterId" <> '' AND "requesterId" NOT GLOB '*[^0-9]*';

COMMIT;
PRAGMA foreign_keys=ON;
