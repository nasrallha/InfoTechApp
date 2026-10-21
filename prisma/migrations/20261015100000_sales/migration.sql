-- المبيعات: فواتير البيع ومرتجعاتها، عروض الأسعار، ورديات الكاشير
-- إضافة جداول جديدة فقط (بدون مسح أي بيانات)

-- ------------------------------------------------------------
-- ورديات الكاشير
-- ------------------------------------------------------------
CREATE TABLE `shifts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `number` INTEGER NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'open',
    `branchId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `openedAt` DATETIME(3) NOT NULL,
    `openingCash` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `closedAt` DATETIME(3) NULL,
    `closedById` INTEGER NULL,
    `expectedCash` DECIMAL(18, 4) NULL,
    `countedCash` DECIMAL(18, 4) NULL,
    `difference` DECIMAL(18, 4) NULL,
    `notes` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `shifts_number_key`(`number`),
    INDEX `shifts_branchId_idx`(`branchId`),
    INDEX `shifts_userId_idx`(`userId`),
    INDEX `shifts_status_idx`(`status`),
    INDEX `shifts_closedById_idx`(`closedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- فواتير البيع ومرتجعاتها
-- ------------------------------------------------------------
CREATE TABLE `sales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(10) NOT NULL,
    `number` INTEGER NOT NULL,
    `source` VARCHAR(10) NOT NULL DEFAULT 'invoice',
    `branchId` INTEGER NOT NULL,
    `warehouseId` INTEGER NOT NULL,
    `shiftId` INTEGER NULL,
    `customerId` INTEGER NULL,
    `customerArName` VARCHAR(255) NULL,
    `customerEnName` VARCHAR(255) NULL,
    `customerTaxNo` VARCHAR(15) NULL,
    `date` DATETIME(3) NOT NULL,
    `discountType` VARCHAR(10) NOT NULL DEFAULT 'amount',
    `discountValue` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `subtotal` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `itemsDiscount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `invoiceDiscount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `netAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `taxAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `totalAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `paidAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `remainingAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `tenderedAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `changeAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `costAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `notes` VARCHAR(500) NULL,
    `returnOfId` INTEGER NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sales_type_number_key`(`type`, `number`),
    INDEX `sales_date_idx`(`date`),
    INDEX `sales_branchId_idx`(`branchId`),
    INDEX `sales_warehouseId_idx`(`warehouseId`),
    INDEX `sales_shiftId_idx`(`shiftId`),
    INDEX `sales_customerId_idx`(`customerId`),
    INDEX `sales_returnOfId_idx`(`returnOfId`),
    INDEX `sales_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `sale_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `saleId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `arName` VARCHAR(150) NOT NULL,
    `enName` VARCHAR(150) NOT NULL,
    `unitId` INTEGER NOT NULL,
    `factor` DECIMAL(18, 4) NOT NULL DEFAULT 1,
    `qty` DECIMAL(18, 3) NOT NULL,
    `baseQty` DECIMAL(18, 4) NOT NULL,
    `price` DECIMAL(18, 4) NOT NULL,
    `priceIncludesTax` BOOLEAN NOT NULL DEFAULT false,
    `discountType` VARCHAR(10) NOT NULL DEFAULT 'amount',
    `discountValue` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `itemDiscount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `invoiceDiscount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `taxRate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `netAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `taxAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `totalAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `cost` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `costAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `returnedQty` DECIMAL(18, 3) NOT NULL DEFAULT 0,
    `returnOfItemId` INTEGER NULL,

    INDEX `sale_items_saleId_idx`(`saleId`),
    INDEX `sale_items_productId_idx`(`productId`),
    INDEX `sale_items_unitId_idx`(`unitId`),
    INDEX `sale_items_returnOfItemId_idx`(`returnOfItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `sale_payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `saleId` INTEGER NOT NULL,
    `paymentMethodId` INTEGER NOT NULL,
    `amount` DECIMAL(18, 4) NOT NULL,
    `reference` VARCHAR(100) NULL,

    INDEX `sale_payments_saleId_idx`(`saleId`),
    INDEX `sale_payments_paymentMethodId_idx`(`paymentMethodId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- عروض الأسعار
-- ------------------------------------------------------------
CREATE TABLE `quotations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `number` INTEGER NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'open',
    `branchId` INTEGER NOT NULL,
    `customerId` INTEGER NULL,
    `customerArName` VARCHAR(255) NULL,
    `customerEnName` VARCHAR(255) NULL,
    `customerTaxNo` VARCHAR(15) NULL,
    `date` DATETIME(3) NOT NULL,
    `validUntil` DATE NOT NULL,
    `discountType` VARCHAR(10) NOT NULL DEFAULT 'amount',
    `discountValue` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `subtotal` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `itemsDiscount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `invoiceDiscount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `netAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `taxAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `totalAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `notes` VARCHAR(1000) NULL,
    `saleId` INTEGER NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `quotations_number_key`(`number`),
    UNIQUE INDEX `quotations_saleId_key`(`saleId`),
    INDEX `quotations_branchId_idx`(`branchId`),
    INDEX `quotations_customerId_idx`(`customerId`),
    INDEX `quotations_createdById_idx`(`createdById`),
    INDEX `quotations_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `quotation_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `quotationId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `arName` VARCHAR(150) NOT NULL,
    `enName` VARCHAR(150) NOT NULL,
    `unitId` INTEGER NOT NULL,
    `factor` DECIMAL(18, 4) NOT NULL DEFAULT 1,
    `qty` DECIMAL(18, 3) NOT NULL,
    `price` DECIMAL(18, 4) NOT NULL,
    `priceIncludesTax` BOOLEAN NOT NULL DEFAULT false,
    `discountType` VARCHAR(10) NOT NULL DEFAULT 'amount',
    `discountValue` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `itemDiscount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `invoiceDiscount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `taxRate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `netAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `taxAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `totalAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,

    INDEX `quotation_items_quotationId_idx`(`quotationId`),
    INDEX `quotation_items_productId_idx`(`productId`),
    INDEX `quotation_items_unitId_idx`(`unitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- العلاقات
-- ------------------------------------------------------------
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_closedById_fkey` FOREIGN KEY (`closedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `sales` ADD CONSTRAINT `sales_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `sales` ADD CONSTRAINT `sales_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `sales` ADD CONSTRAINT `sales_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `shifts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `sales` ADD CONSTRAINT `sales_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `sales` ADD CONSTRAINT `sales_returnOfId_fkey` FOREIGN KEY (`returnOfId`) REFERENCES `sales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `sales` ADD CONSTRAINT `sales_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `sales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_returnOfItemId_fkey` FOREIGN KEY (`returnOfItemId`) REFERENCES `sale_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `sale_payments` ADD CONSTRAINT `sale_payments_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `sales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `sale_payments` ADD CONSTRAINT `sale_payments_paymentMethodId_fkey` FOREIGN KEY (`paymentMethodId`) REFERENCES `payment_methods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `quotations` ADD CONSTRAINT `quotations_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `quotations` ADD CONSTRAINT `quotations_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `quotations` ADD CONSTRAINT `quotations_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `sales`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `quotations` ADD CONSTRAINT `quotations_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `quotation_items` ADD CONSTRAINT `quotation_items_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `quotations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `quotation_items` ADD CONSTRAINT `quotation_items_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `quotation_items` ADD CONSTRAINT `quotation_items_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- أول رقم لكل نوع مستند يبدأ من 1
INSERT INTO `document_sequences` (`key`, `last`) VALUES
    ('sale', 0),
    ('sale_return', 0),
    ('quotation', 0),
    ('shift', 0)
ON DUPLICATE KEY UPDATE `last` = `last`;
