-- المخازن والفروع: المستودعات، الأرصدة، حركات المخزون، التحويلات، الجرد، قوائم الأسعار
-- إضافة جداول وأعمدة جديدة فقط + تحويل البيانات الموجودة (بدون مسح أي بيانات)

-- ------------------------------------------------------------
-- المستودعات
-- ------------------------------------------------------------
CREATE TABLE `warehouses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `arName` VARCHAR(100) NOT NULL,
    `enName` VARCHAR(100) NOT NULL,
    `isMain` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `notes` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `warehouses_arName_key`(`arName`),
    UNIQUE INDEX `warehouses_enName_key`(`enName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- المستودع الرئيسي (كل الفروع الحالية والمشتريات السابقة عليه)
INSERT INTO `warehouses` (`id`, `arName`, `enName`, `isMain`, `isActive`, `updatedAt`)
VALUES (1, 'المستودع الرئيسي', 'Main Warehouse', true, true, CURRENT_TIMESTAMP(3));

-- ------------------------------------------------------------
-- قوائم الأسعار
-- ------------------------------------------------------------
CREATE TABLE `price_lists` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `arName` VARCHAR(100) NOT NULL,
    `enName` VARCHAR(100) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `notes` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `price_lists_arName_key`(`arName`),
    UNIQUE INDEX `price_lists_enName_key`(`enName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `product_prices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `priceListId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `unitId` INTEGER NOT NULL,
    `price` DECIMAL(18, 4) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `product_prices_priceListId_productId_unitId_key`(`priceListId`, `productId`, `unitId`),
    INDEX `product_prices_productId_idx`(`productId`),
    INDEX `product_prices_unitId_idx`(`unitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- الفروع: بيانات الفاتورة + المستودع + قائمة الأسعار
-- ------------------------------------------------------------
ALTER TABLE `branches`
    ADD COLUMN `phone` VARCHAR(20) NULL,
    ADD COLUMN `registrationNo` VARCHAR(10) NULL,
    ADD COLUMN `city` VARCHAR(100) NULL,
    ADD COLUMN `district` VARCHAR(100) NULL,
    ADD COLUMN `street` VARCHAR(100) NULL,
    ADD COLUMN `buildingNo` VARCHAR(4) NULL,
    ADD COLUMN `additionalNo` VARCHAR(4) NULL,
    ADD COLUMN `postalCode` VARCHAR(5) NULL,
    ADD COLUMN `warehouseId` INTEGER NULL,
    ADD COLUMN `priceListId` INTEGER NULL;

CREATE INDEX `branches_warehouseId_idx` ON `branches`(`warehouseId`);
CREATE INDEX `branches_priceListId_idx` ON `branches`(`priceListId`);

UPDATE `branches` SET `warehouseId` = 1;

-- ------------------------------------------------------------
-- الإعدادات العامة: البيع بالسالب
-- ------------------------------------------------------------
ALTER TABLE `system_settings` ADD COLUMN `allowNegativeStock` BOOLEAN NOT NULL DEFAULT false;

-- ------------------------------------------------------------
-- المشتريات: المستودع (كل الفواتير السابقة على المستودع الرئيسي)
-- ------------------------------------------------------------
ALTER TABLE `purchases` ADD COLUMN `warehouseId` INTEGER NULL;
UPDATE `purchases` SET `warehouseId` = 1;
ALTER TABLE `purchases` MODIFY `warehouseId` INTEGER NOT NULL;
CREATE INDEX `purchases_warehouseId_idx` ON `purchases`(`warehouseId`);

-- ------------------------------------------------------------
-- الأرصدة وحركات المخزون
-- ------------------------------------------------------------
CREATE TABLE `stock_balances` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `warehouseId` INTEGER NOT NULL,
    `qty` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `stock_balances_productId_warehouseId_key`(`productId`, `warehouseId`),
    INDEX `stock_balances_warehouseId_idx`(`warehouseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `stock_movements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `warehouseId` INTEGER NOT NULL,
    `qty` DECIMAL(18, 4) NOT NULL,
    `cost` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `type` VARCHAR(20) NOT NULL,
    `refType` VARCHAR(20) NOT NULL,
    `refId` INTEGER NOT NULL,
    `refNo` VARCHAR(30) NULL,
    `date` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `stock_movements_productId_warehouseId_date_idx`(`productId`, `warehouseId`, `date`),
    INDEX `stock_movements_warehouseId_idx`(`warehouseId`),
    INDEX `stock_movements_refType_refId_idx`(`refType`, `refId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- التحويلات المخزنية
-- ------------------------------------------------------------
CREATE TABLE `stock_transfers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `number` INTEGER NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'sent',
    `fromWarehouseId` INTEGER NOT NULL,
    `toWarehouseId` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `receivedAt` DATETIME(3) NULL,
    `notes` VARCHAR(500) NULL,
    `createdById` INTEGER NOT NULL,
    `receivedById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `stock_transfers_number_key`(`number`),
    INDEX `stock_transfers_fromWarehouseId_idx`(`fromWarehouseId`),
    INDEX `stock_transfers_toWarehouseId_idx`(`toWarehouseId`),
    INDEX `stock_transfers_createdById_idx`(`createdById`),
    INDEX `stock_transfers_receivedById_idx`(`receivedById`),
    INDEX `stock_transfers_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `stock_transfer_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `transferId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `arName` VARCHAR(150) NOT NULL,
    `enName` VARCHAR(150) NOT NULL,
    `unitId` INTEGER NOT NULL,
    `factor` DECIMAL(18, 4) NOT NULL DEFAULT 1,
    `qty` DECIMAL(18, 3) NOT NULL,
    `baseQty` DECIMAL(18, 4) NOT NULL,
    `receivedQty` DECIMAL(18, 3) NULL,
    `cost` DECIMAL(18, 4) NOT NULL DEFAULT 0,

    INDEX `stock_transfer_items_transferId_idx`(`transferId`),
    INDEX `stock_transfer_items_productId_idx`(`productId`),
    INDEX `stock_transfer_items_unitId_idx`(`unitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- الجرد
-- ------------------------------------------------------------
CREATE TABLE `inventory_counts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `number` INTEGER NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'draft',
    `warehouseId` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `postedAt` DATETIME(3) NULL,
    `notes` VARCHAR(500) NULL,
    `createdById` INTEGER NOT NULL,
    `postedById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inventory_counts_number_key`(`number`),
    INDEX `inventory_counts_warehouseId_idx`(`warehouseId`),
    INDEX `inventory_counts_createdById_idx`(`createdById`),
    INDEX `inventory_counts_postedById_idx`(`postedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inventory_count_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `countId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `systemQty` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `countedQty` DECIMAL(18, 4) NOT NULL,
    `diffQty` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `cost` DECIMAL(18, 4) NOT NULL DEFAULT 0,

    UNIQUE INDEX `inventory_count_items_countId_productId_key`(`countId`, `productId`),
    INDEX `inventory_count_items_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- العلاقات (Foreign Keys)
-- ------------------------------------------------------------
ALTER TABLE `branches` ADD CONSTRAINT `branches_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `branches` ADD CONSTRAINT `branches_priceListId_fkey` FOREIGN KEY (`priceListId`) REFERENCES `price_lists`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_balances` ADD CONSTRAINT `stock_balances_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `stock_balances` ADD CONSTRAINT `stock_balances_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_transfers` ADD CONSTRAINT `stock_transfers_fromWarehouseId_fkey` FOREIGN KEY (`fromWarehouseId`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_transfers` ADD CONSTRAINT `stock_transfers_toWarehouseId_fkey` FOREIGN KEY (`toWarehouseId`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_transfers` ADD CONSTRAINT `stock_transfers_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_transfers` ADD CONSTRAINT `stock_transfers_receivedById_fkey` FOREIGN KEY (`receivedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_transfer_items` ADD CONSTRAINT `stock_transfer_items_transferId_fkey` FOREIGN KEY (`transferId`) REFERENCES `stock_transfers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `stock_transfer_items` ADD CONSTRAINT `stock_transfer_items_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_transfer_items` ADD CONSTRAINT `stock_transfer_items_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `inventory_counts` ADD CONSTRAINT `inventory_counts_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `inventory_counts` ADD CONSTRAINT `inventory_counts_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `inventory_counts` ADD CONSTRAINT `inventory_counts_postedById_fkey` FOREIGN KEY (`postedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `inventory_count_items` ADD CONSTRAINT `inventory_count_items_countId_fkey` FOREIGN KEY (`countId`) REFERENCES `inventory_counts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `inventory_count_items` ADD CONSTRAINT `inventory_count_items_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `product_prices` ADD CONSTRAINT `product_prices_priceListId_fkey` FOREIGN KEY (`priceListId`) REFERENCES `price_lists`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `product_prices` ADD CONSTRAINT `product_prices_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `product_prices` ADD CONSTRAINT `product_prices_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- مسلسل المستندات الجديدة
-- ------------------------------------------------------------
INSERT INTO `document_sequences` (`key`, `last`) VALUES ('transfer', 0), ('count', 0);

-- ------------------------------------------------------------
-- تحويل البيانات الموجودة لحركات مخزون (على المستودع الرئيسي)
-- ------------------------------------------------------------

-- 1) الرصيد الافتتاحي لكل صنف
INSERT INTO `stock_movements` (`productId`, `warehouseId`, `qty`, `cost`, `type`, `refType`, `refId`, `refNo`, `date`)
SELECT `id`, 1, `startStock`, `cost`, 'opening', 'product', `id`, NULL, `createdAt`
FROM `products`
WHERE `startStock` <> 0;

-- 2) فواتير الشراء (دخول) ومرتجعاتها (خروج)
INSERT INTO `stock_movements` (`productId`, `warehouseId`, `qty`, `cost`, `type`, `refType`, `refId`, `refNo`, `date`)
SELECT
    pi.`productId`,
    p.`warehouseId`,
    CASE WHEN p.`type` = 'return' THEN -pi.`baseQty` ELSE pi.`baseQty` END,
    CASE WHEN pi.`baseQty` > 0 THEN pi.`netAmount` / pi.`baseQty` ELSE 0 END,
    CASE WHEN p.`type` = 'return' THEN 'purchase_return' ELSE 'purchase' END,
    'purchase',
    p.`id`,
    CONCAT(CASE WHEN p.`type` = 'return' THEN 'PR-' ELSE 'PI-' END, p.`number`),
    p.`date`
FROM `purchase_items` pi
JOIN `purchases` p ON p.`id` = pi.`purchaseId`;

-- 3) الأرصدة = مجموع الحركات
INSERT INTO `stock_balances` (`productId`, `warehouseId`, `qty`, `updatedAt`)
SELECT `productId`, `warehouseId`, SUM(`qty`), CURRENT_TIMESTAMP(3)
FROM `stock_movements`
GROUP BY `productId`, `warehouseId`;
