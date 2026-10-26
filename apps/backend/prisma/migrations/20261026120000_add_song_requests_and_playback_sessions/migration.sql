-- CreateTable
CREATE TABLE "SongRequest" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "requesterId" TEXT,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'queue',
    "outcome" TEXT NOT NULL DEFAULT 'queued',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SongRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybackSession" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "requestId" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "artist" TEXT NOT NULL DEFAULT '',
    "durationMs" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'unknown',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "listenedMs" INTEGER NOT NULL DEFAULT 0,
    "endReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaybackSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SongRequest_roomId_requestedAt_idx" ON "SongRequest"("roomId", "requestedAt");

-- CreateIndex
CREATE INDEX "SongRequest_roomId_videoId_idx" ON "SongRequest"("roomId", "videoId");

-- CreateIndex
CREATE INDEX "SongRequest_roomId_requesterId_requestedAt_idx" ON "SongRequest"("roomId", "requesterId", "requestedAt");

-- CreateIndex
CREATE INDEX "PlaybackSession_roomId_startedAt_idx" ON "PlaybackSession"("roomId", "startedAt");

-- CreateIndex
CREATE INDEX "PlaybackSession_roomId_videoId_idx" ON "PlaybackSession"("roomId", "videoId");

-- CreateIndex
CREATE INDEX "PlaybackSession_roomId_requestId_idx" ON "PlaybackSession"("roomId", "requestId");

-- AddForeignKey
ALTER TABLE "SongRequest" ADD CONSTRAINT "SongRequest_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybackSession" ADD CONSTRAINT "PlaybackSession_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybackSession" ADD CONSTRAINT "PlaybackSession_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SongRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
