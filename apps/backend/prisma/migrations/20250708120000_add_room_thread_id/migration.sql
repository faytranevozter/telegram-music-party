-- AlterTable
ALTER TABLE "Room" ADD COLUMN "threadId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Room_chatId_threadId_key" ON "Room"("chatId", "threadId");
