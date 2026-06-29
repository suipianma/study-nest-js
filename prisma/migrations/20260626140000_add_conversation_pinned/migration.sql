-- AlterTable
ALTER TABLE `Conversation` ADD COLUMN `pinnedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `Conversation_userId_pinnedAt_updatedAt_idx` ON `Conversation`(`userId`, `pinnedAt`, `updatedAt`);
