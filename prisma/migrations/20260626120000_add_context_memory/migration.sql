-- CreateTable
CREATE TABLE `Memory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ownerUserId` INTEGER NOT NULL,
    `scope` ENUM('USER', 'CONVERSATION', 'GLOBAL') NOT NULL,
    `type` ENUM('MESSAGE', 'SUMMARY', 'PROMPT', 'POLICY', 'RAG', 'PROFILE', 'PREFERENCE', 'FACT', 'OTHER') NOT NULL,
    `category` VARCHAR(100) NOT NULL,
    `content` TEXT NOT NULL,
    `sourceConversationId` INTEGER NULL,
    `sourceMessageId` INTEGER NULL,
    `importance` INTEGER NOT NULL DEFAULT 50,
    `expiresAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Memory_ownerUserId_type_updatedAt_idx`(`ownerUserId`, `type`, `updatedAt`),
    INDEX `Memory_ownerUserId_scope_category_updatedAt_idx`(`ownerUserId`, `scope`, `category`, `updatedAt`),
    INDEX `Memory_ownerUserId_deletedAt_expiresAt_idx`(`ownerUserId`, `deletedAt`, `expiresAt`),
    INDEX `Memory_ownerUserId_deletedAt_updatedAt_idx`(`ownerUserId`, `deletedAt`, `updatedAt`),
    INDEX `Memory_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Memory` ADD CONSTRAINT `Memory_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Memory` ADD CONSTRAINT `Memory_sourceConversationId_fkey` FOREIGN KEY (`sourceConversationId`) REFERENCES `Conversation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Memory` ADD CONSTRAINT `Memory_sourceMessageId_fkey` FOREIGN KEY (`sourceMessageId`) REFERENCES `Message`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
