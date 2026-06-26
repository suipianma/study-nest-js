-- AlterTable
ALTER TABLE `Message` ADD COLUMN `promptTokens` INTEGER NULL,
    ADD COLUMN `completionTokens` INTEGER NULL;
