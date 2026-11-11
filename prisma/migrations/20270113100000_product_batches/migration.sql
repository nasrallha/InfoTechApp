-- ------------------------------------------------------------
-- تتبع الصلاحية والدفعات (ميزة للشركة من اللوحة: expiry)
-- - الصنف المتتبع: رصيده مقسوم دفعات (رقم الدفعة + الإنتاج + الانتهاء)
-- - البيع والخروج: من الأقرب انتهاءً (FEFO)، والمرتجع لنفس الدفعة
-- - batch_moves: كل مستند خد/دخّل كام من أنهي دفعة (للإلغاء وكارت الدفعة)
-- ------------------------------------------------------------
ALTER TABLE `products`
    ADD COLUMN `trackExpiry` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `expiryAlertDays` INTEGER NULL;

ALTER TABLE `system_settings`
    ADD COLUMN `expiryBlockSale` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `expiryAutoDispose` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `expiryAlertDays` INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN `expiryBarcode` VARCHAR(10) NOT NULL DEFAULT 'simple';

CREATE TABLE IF NOT EXISTS `product_batches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `warehouseId` INTEGER NOT NULL,
    `batchNo` VARCHAR(50) NOT NULL,
    `mfgDate` DATE NULL,
    `expDate` DATE NULL,
    `qty` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `product_batches_productId_warehouseId_batchNo_key`(`productId`, `warehouseId`, `batchNo`),
    INDEX `product_batches_productId_warehouseId_expDate_idx`(`productId`, `warehouseId`, `expDate`),
    INDEX `product_batches_warehouseId_idx`(`warehouseId`),
    INDEX `product_batches_expDate_idx`(`expDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `product_batches`
    ADD CONSTRAINT `product_batches_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `product_batches`
    ADD CONSTRAINT `product_batches_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS `batch_moves` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `batchId` INTEGER NOT NULL,
    `qty` DECIMAL(18, 4) NOT NULL,
    `moveType` VARCHAR(20) NOT NULL,
    `refType` VARCHAR(20) NOT NULL,
    `refId` INTEGER NOT NULL,
    `refNo` VARCHAR(30) NULL,
    `moveDate` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `batch_moves_batchId_idx`(`batchId`),
    INDEX `batch_moves_refType_refId_idx`(`refType`, `refId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `batch_moves`
    ADD CONSTRAINT `batch_moves_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `product_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
