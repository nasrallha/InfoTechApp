-- المشتريات: الإعدادات العامة + مسلسل المستندات + فواتير الشراء ومرتجعاتها
-- إضافة جداول جديدة فقط، بدون مسح أي بيانات

-- CreateTable
CREATE TABLE `system_settings` (
    `id` INTEGER NOT NULL,
    `purchaseTaxMode` VARCHAR(10) NOT NULL DEFAULT 'exclusive',
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_sequences` (
    `key` VARCHAR(30) NOT NULL,
    `last` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(10) NOT NULL,
    `number` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,
    `supplierId` INTEGER NOT NULL,
    `supplierArName` VARCHAR(255) NOT NULL,
    `supplierEnName` VARCHAR(255) NOT NULL,
    `supplierTaxNo` VARCHAR(15) NULL,
    `supplierInvoiceNo` VARCHAR(50) NULL,
    `supplierInvoiceDate` DATE NULL,
    `date` DATETIME(3) NOT NULL,
    `taxMode` VARCHAR(10) NOT NULL,
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
    `notes` VARCHAR(500) NULL,
    `returnOfId` INTEGER NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `purchases_type_number_key`(`type`, `number`),
    UNIQUE INDEX `purchases_type_supplierId_supplierInvoiceNo_key`(`type`, `supplierId`, `supplierInvoiceNo`),
    INDEX `purchases_supplierInvoiceNo_idx`(`supplierInvoiceNo`),
    INDEX `purchases_date_idx`(`date`),
    INDEX `purchases_supplierId_idx`(`supplierId`),
    INDEX `purchases_branchId_idx`(`branchId`),
    INDEX `purchases_returnOfId_idx`(`returnOfId`),
    INDEX `purchases_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `purchaseId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `arName` VARCHAR(150) NOT NULL,
    `enName` VARCHAR(150) NOT NULL,
    `unitId` INTEGER NOT NULL,
    `factor` DECIMAL(18, 4) NOT NULL DEFAULT 1,
    `qty` DECIMAL(18, 3) NOT NULL,
    `baseQty` DECIMAL(18, 4) NOT NULL,
    `price` DECIMAL(18, 4) NOT NULL,
    `discountType` VARCHAR(10) NOT NULL DEFAULT 'amount',
    `discountValue` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `itemDiscount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `invoiceDiscount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `taxRate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `netAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `taxAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `totalAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `returnedQty` DECIMAL(18, 3) NOT NULL DEFAULT 0,
    `returnOfItemId` INTEGER NULL,

    INDEX `purchase_items_purchaseId_idx`(`purchaseId`),
    INDEX `purchase_items_productId_idx`(`productId`),
    INDEX `purchase_items_unitId_idx`(`unitId`),
    INDEX `purchase_items_returnOfItemId_idx`(`returnOfItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `purchaseId` INTEGER NOT NULL,
    `paymentMethodId` INTEGER NOT NULL,
    `amount` DECIMAL(18, 4) NOT NULL,
    `reference` VARCHAR(100) NULL,

    INDEX `purchase_payments_purchaseId_idx`(`purchaseId`),
    INDEX `purchase_payments_paymentMethodId_idx`(`paymentMethodId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_returnOfId_fkey` FOREIGN KEY (`returnOfId`) REFERENCES `purchases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_items` ADD CONSTRAINT `purchase_items_purchaseId_fkey` FOREIGN KEY (`purchaseId`) REFERENCES `purchases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_items` ADD CONSTRAINT `purchase_items_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_items` ADD CONSTRAINT `purchase_items_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_items` ADD CONSTRAINT `purchase_items_returnOfItemId_fkey` FOREIGN KEY (`returnOfItemId`) REFERENCES `purchase_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_payments` ADD CONSTRAINT `purchase_payments_purchaseId_fkey` FOREIGN KEY (`purchaseId`) REFERENCES `purchases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_payments` ADD CONSTRAINT `purchase_payments_paymentMethodId_fkey` FOREIGN KEY (`paymentMethodId`) REFERENCES `payment_methods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- أول رقم لكل نوع مستند يبدأ من 1
INSERT INTO `document_sequences` (`key`, `last`) VALUES
    ('purchase', 0),
    ('purchase_return', 0);
