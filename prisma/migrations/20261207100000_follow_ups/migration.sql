-- ------------------------------------------------------------
-- المتابعة الدورية (وحدة followUps)
-- ------------------------------------------------------------
ALTER TABLE `products` ADD COLUMN `followUpDays` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `follow_ups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customerId` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,
    `productId` INTEGER NULL,
    `deviceName` VARCHAR(150) NOT NULL,
    `originSaleId` INTEGER NULL,
    `saleItemId` INTEGER NULL,
    `intervalDays` INTEGER NOT NULL,
    `place` VARCHAR(100) NULL,
    `address` VARCHAR(500) NULL,
    `locationUrl` VARCHAR(500) NULL,
    `phone` VARCHAR(30) NULL,
    `notes` VARCHAR(500) NULL,
    `lastDate` DATE NOT NULL,
    `nextDate` DATE NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'active',
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `follow_ups_customerId_idx`(`customerId`),
    INDEX `follow_ups_branchId_idx`(`branchId`),
    INDEX `follow_ups_productId_idx`(`productId`),
    INDEX `follow_ups_originSaleId_idx`(`originSaleId`),
    INDEX `follow_ups_saleItemId_idx`(`saleItemId`),
    INDEX `follow_ups_status_nextDate_idx`(`status`, `nextDate`),
    INDEX `follow_ups_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `follow_up_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `followUpId` INTEGER NOT NULL,
    `type` VARCHAR(12) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `note` VARCHAR(500) NULL,
    `saleId` INTEGER NULL,
    `prevLastDate` DATE NULL,
    `prevNextDate` DATE NULL,
    `nextDate` DATE NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `follow_up_logs_followUpId_idx`(`followUpId`),
    INDEX `follow_up_logs_saleId_idx`(`saleId`),
    INDEX `follow_up_logs_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `follow_ups` ADD CONSTRAINT `follow_ups_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `follow_ups` ADD CONSTRAINT `follow_ups_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `follow_ups` ADD CONSTRAINT `follow_ups_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `follow_ups` ADD CONSTRAINT `follow_ups_originSaleId_fkey` FOREIGN KEY (`originSaleId`) REFERENCES `sales`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `follow_ups` ADD CONSTRAINT `follow_ups_saleItemId_fkey` FOREIGN KEY (`saleItemId`) REFERENCES `sale_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `follow_ups` ADD CONSTRAINT `follow_ups_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `follow_up_logs` ADD CONSTRAINT `follow_up_logs_followUpId_fkey` FOREIGN KEY (`followUpId`) REFERENCES `follow_ups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `follow_up_logs` ADD CONSTRAINT `follow_up_logs_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `sales`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `follow_up_logs` ADD CONSTRAINT `follow_up_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
