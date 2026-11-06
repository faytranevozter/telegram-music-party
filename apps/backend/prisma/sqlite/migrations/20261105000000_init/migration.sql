CREATE TABLE "Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "threadId" INTEGER,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "Queue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "Feature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "minimumVotes" INTEGER NOT NULL DEFAULT 5,
    "nextCommand" BOOLEAN NOT NULL DEFAULT false,
    "nextOnlyAdmin" BOOLEAN NOT NULL DEFAULT true,
    "radioCommand" BOOLEAN NOT NULL DEFAULT true,
    "radioOnlyAdmin" BOOLEAN NOT NULL DEFAULT true,
    "refreshCommand" BOOLEAN NOT NULL DEFAULT true,
    "refreshOnlyAdmin" BOOLEAN NOT NULL DEFAULT true,
    "previousCommand" BOOLEAN NOT NULL DEFAULT false,
    "previousOnlyAdmin" BOOLEAN NOT NULL DEFAULT true,
    "muteCommand" BOOLEAN NOT NULL DEFAULT true,
    "unmuteCommand" BOOLEAN NOT NULL DEFAULT true,
    "volumeCommand" BOOLEAN NOT NULL DEFAULT false,
    "maxQueueSize" INTEGER NOT NULL DEFAULT 25,
    "playNextCommand" BOOLEAN NOT NULL DEFAULT false,
    "dailyPlayNextLimit" INTEGER NOT NULL DEFAULT 3,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "SongRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "requesterId" TEXT,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'queue',
    "outcome" TEXT NOT NULL DEFAULT 'queued',
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "PlaybackSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "requestId" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "artist" TEXT NOT NULL DEFAULT '',
    "durationMs" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'unknown',
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "listenedMs" INTEGER NOT NULL DEFAULT 0,
    "endReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("requestId") REFERENCES "SongRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Room_id_key" ON "Room"("id");
CREATE UNIQUE INDEX "Room_chatId_threadId_key" ON "Room"("chatId", "threadId");
CREATE INDEX "Device_roomId_fingerprint_idx" ON "Device"("roomId", "fingerprint");
CREATE UNIQUE INDEX "Feature_roomId_key" ON "Feature"("roomId");
CREATE INDEX "SongRequest_roomId_requestedAt_idx" ON "SongRequest"("roomId", "requestedAt");
CREATE INDEX "SongRequest_roomId_videoId_idx" ON "SongRequest"("roomId", "videoId");
CREATE INDEX "SongRequest_roomId_requesterId_requestedAt_idx" ON "SongRequest"("roomId", "requesterId", "requestedAt");
CREATE INDEX "PlaybackSession_roomId_startedAt_idx" ON "PlaybackSession"("roomId", "startedAt");
CREATE INDEX "PlaybackSession_roomId_videoId_idx" ON "PlaybackSession"("roomId", "videoId");
CREATE INDEX "PlaybackSession_roomId_requestId_idx" ON "PlaybackSession"("roomId", "requestId");
