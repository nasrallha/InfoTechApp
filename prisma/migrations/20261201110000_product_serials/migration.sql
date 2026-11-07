-- الأرقام التسلسلية: القطع + ربطها بسطور البيع والمرتجع + الضمان على سطر البيع

-- AlterTable
ALTER TABLE `sale_items` ADD COLUMN `warrantyMonths` INTEGER NULL,
    ADD COLUMN `warrantyType` VARCHAR(10) NULL;

-- CreateTable
CREATE TABLE `product_serials` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `serial` VARCHAR(100) NOT NULL,
    `serial2` VARCHAR(100) NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'in_stock',
    `isUsed` BOOLEAN NOT NULL DEFAULT false,
    `purchaseItemId` INTEGER NULL,
    `saleItemId` INTEGER NULL,
    `customerId` INTEGER NULL,
    `soldAt` DATETIME(3) NULL,
    `warrantyMonths` INTEGER NULL,
    `warrantyType` VARCHAR(10) NULL,
    `warrantyEndsAt` DATE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `product_serials_productId_serial_key`(`productId`, `serial`),
    INDEX `product_serials_serial_idx`(`serial`),
    INDEX `product_serials_serial2_idx`(`serial2`),
    INDEX `product_serials_status_idx`(`status`),
    INDEX `product_serials_purchaseItemId_idx`(`purchaseItemId`),
    INDEX `product_serials_saleItemId_idx`(`saleItemId`),
    INDEX `product_serials_customerId_idx`(`customerId`),
    INDEX `product_serials_warrantyEndsAt_idx`(`warrantyEndsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sale_item_serials` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `saleItemId` INTEGER NOT NULL,
    `serialId` INTEGER NOT NULL,
    `serialText` VARCHAR(100) NOT NULL,
    `serial2Text` VARCHAR(100) NULL,

    UNIQUE INDEX `sale_item_serials_saleItemId_serialId_key`(`saleItemId`, `serialId`),
    INDEX `sale_item_serials_serialId_idx`(`serialId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `product_serials` ADD CONSTRAINT `product_serials_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_serials` ADD CONSTRAINT `product_serials_purchaseItemId_fkey` FOREIGN KEY (`purchaseItemId`) REFERENCES `purchase_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_serials` ADD CONSTRAINT `product_serials_saleItemId_fkey` FOREIGN KEY (`saleItemId`) REFERENCES `sale_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_serials` ADD CONSTRAINT `product_serials_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_item_serials` ADD CONSTRAINT `sale_item_serials_saleItemId_fkey` FOREIGN KEY (`saleItemId`) REFERENCES `sale_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_item_serials` ADD CONSTRAINT `sale_item_serials_serialId_fkey` FOREIGN KEY (`serialId`) REFERENCES `product_serials`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
