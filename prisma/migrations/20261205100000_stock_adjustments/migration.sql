-- ------------------------------------------------------------
-- التوالف والزيادات
-- ------------------------------------------------------------
CREATE TABLE `stock_adjustments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `number` INTEGER NOT NULL,
    `type` VARCHAR(10) NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'posted',
    `warehouseId` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `notes` VARCHAR(500) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `stock_adjustments_number_key`(`number`),
    INDEX `stock_adjustments_warehouseId_idx`(`warehouseId`),
    INDEX `stock_adjustments_createdById_idx`(`createdById`),
    INDEX `stock_adjustments_type_status_idx`(`type`, `status`),
    INDEX `stock_adjustments_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `stock_adjustment_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `adjustmentId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `arName` VARCHAR(150) NOT NULL,
    `enName` VARCHAR(150) NOT NULL,
    `unitId` INTEGER NOT NULL,
    `factor` DECIMAL(18, 4) NOT NULL DEFAULT 1,
    `qty` DECIMAL(18, 3) NOT NULL,
    `baseQty` DECIMAL(18, 4) NOT NULL,
    `cost` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `reason` VARCHAR(255) NULL,

    INDEX `stock_adjustment_items_adjustmentId_idx`(`adjustmentId`),
    INDEX `stock_adjustment_items_productId_idx`(`productId`),
    INDEX `stock_adjustment_items_unitId_idx`(`unitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `stock_adjustments` ADD CONSTRAINT `stock_adjustments_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_adjustments` ADD CONSTRAINT `stock_adjustments_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_adjustment_items` ADD CONSTRAINT `stock_adjustment_items_adjustmentId_fkey` FOREIGN KEY (`adjustmentId`) REFERENCES `stock_adjustments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `stock_adjustment_items` ADD CONSTRAINT `stock_adjustment_items_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_adjustment_items` ADD CONSTRAINT `stock_adjustment_items_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
