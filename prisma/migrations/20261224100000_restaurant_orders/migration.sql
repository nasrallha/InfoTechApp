-- ------------------------------------------------------------
-- طلبات المطعم (وحدة restaurant) - المرحلة 1-ب: الكاشير
-- - رقم الطلب يومي لكل فرع (dailyNo) يبدأ من 1 كل يوم عمل
-- - orderType: dinein صالة | takeaway سفري | delivery توصيل | app تطبيق
-- - status: open طاولة مفتوحة (لسه من غير فاتورة، السطور في lines)
--           paid اتفوتر (saleId) | cancelled ملغي
-- - التوصيل: السائق ورسوم التوصيل (تقرير السائقين)، التطبيق: channelId
-- ------------------------------------------------------------
CREATE TABLE `restaurant_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branchId` INTEGER NOT NULL,
    `bizDay` DATE NOT NULL,
    `dailyNo` INTEGER NOT NULL,
    `orderType` VARCHAR(10) NOT NULL DEFAULT 'takeaway',
    `status` VARCHAR(10) NOT NULL DEFAULT 'open',
    `tableNo` VARCHAR(20) NULL,
    `channelId` INTEGER NULL,
    `channelOrderNo` VARCHAR(50) NULL,
    `driverId` INTEGER NULL,
    `customerId` INTEGER NULL,
    `customerName` VARCHAR(150) NULL,
    `phone` VARCHAR(30) NULL,
    `address` VARCHAR(500) NULL,
    `deliveryFee` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `servicePercent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `lines` JSON NULL,
    `total` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `saleId` INTEGER NULL,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `restaurant_orders_saleId_key`(`saleId`),
    UNIQUE INDEX `restaurant_orders_branchId_bizDay_dailyNo_key`(`branchId`, `bizDay`, `dailyNo`),
    INDEX `restaurant_orders_status_idx`(`status`),
    INDEX `restaurant_orders_channelId_idx`(`channelId`),
    INDEX `restaurant_orders_driverId_idx`(`driverId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `restaurant_orders` ADD CONSTRAINT `restaurant_orders_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `sales`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `restaurant_orders` ADD CONSTRAINT `restaurant_orders_channelId_fkey` FOREIGN KEY (`channelId`) REFERENCES `sales_channels`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `restaurant_orders` ADD CONSTRAINT `restaurant_orders_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `restaurant_drivers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
