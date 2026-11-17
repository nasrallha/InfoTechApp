-- ------------------------------------------------------------
-- المقاولات (وحدة contracting): العقود (مع المالك / مقاولي الباطن) والمقايسة
-- وأوامر التغيير والمستخلصات والتحصيل ونماذج صيغة العقد
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `construction_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `kind` VARCHAR(10) NULL,
    `content` TEXT NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `construction_contracts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `number` INTEGER NOT NULL,
    `docCode` VARCHAR(10) NULL,
    `kind` VARCHAR(10) NOT NULL,
    `branchId` INTEGER NOT NULL,
    `customerId` INTEGER NULL,
    `supplierId` INTEGER NULL,
    `parentId` INTEGER NULL,
    `projectName` VARCHAR(200) NOT NULL,
    `projectLocation` VARCHAR(255) NULL,
    `refNo` VARCHAR(60) NULL,
    `signDate` DATE NOT NULL,
    `startDate` DATE NULL,
    `endDate` DATE NOT NULL,
    `taxRate` DECIMAL(5, 2) NOT NULL DEFAULT 15,
    `advancePct` DECIMAL(7, 4) NOT NULL DEFAULT 0,
    `advanceAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `recoveryPct` DECIMAL(7, 4) NOT NULL DEFAULT 0,
    `retentionPct` DECIMAL(7, 4) NOT NULL DEFAULT 0,
    `retentionReleaseDate` DATE NULL,
    `penaltyPerDay` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `penaltyMaxPct` DECIMAL(7, 4) NOT NULL DEFAULT 0,
    `baseAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `totalAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `advanceSaleId` INTEGER NULL,
    `advancePurchaseId` INTEGER NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'active',
    `templateId` INTEGER NULL,
    `content` TEXT NULL,
    `notes` VARCHAR(1000) NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `construction_contracts_advanceSaleId_key`(`advanceSaleId`),
    UNIQUE INDEX `construction_contracts_advancePurchaseId_key`(`advancePurchaseId`),
    UNIQUE INDEX `construction_contracts_branchId_number_key`(`branchId`, `number`),
    INDEX `construction_contracts_kind_idx`(`kind`),
    INDEX `construction_contracts_customerId_idx`(`customerId`),
    INDEX `construction_contracts_supplierId_idx`(`supplierId`),
    INDEX `construction_contracts_parentId_idx`(`parentId`),
    INDEX `construction_contracts_status_idx`(`status`),
    INDEX `construction_contracts_templateId_idx`(`templateId`),
    INDEX `construction_contracts_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`),
    CONSTRAINT `construction_contracts_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `construction_contracts_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `construction_contracts_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `construction_contracts_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `construction_contracts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `construction_contracts_advanceSaleId_fkey` FOREIGN KEY (`advanceSaleId`) REFERENCES `sales`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `construction_contracts_advancePurchaseId_fkey` FOREIGN KEY (`advancePurchaseId`) REFERENCES `purchases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `construction_contracts_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `construction_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `construction_contracts_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `construction_change_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contractId` INTEGER NOT NULL,
    `seq` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `amount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `notes` VARCHAR(1000) NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `construction_change_orders_contractId_seq_key`(`contractId`, `seq`),
    INDEX `construction_change_orders_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`),
    CONSTRAINT `construction_change_orders_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `construction_contracts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `construction_change_orders_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `construction_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contractId` INTEGER NOT NULL,
    `seq` INTEGER NOT NULL,
    `itemNo` VARCHAR(30) NULL,
    `description` VARCHAR(500) NOT NULL,
    `unitName` VARCHAR(30) NULL,
    `qty` DECIMAL(18, 3) NOT NULL,
    `originalQty` DECIMAL(18, 3) NOT NULL,
    `price` DECIMAL(18, 4) NOT NULL,
    `amount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `changeOrderId` INTEGER NULL,

    INDEX `construction_items_contractId_idx`(`contractId`),
    INDEX `construction_items_changeOrderId_idx`(`changeOrderId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `construction_items_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `construction_contracts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `construction_items_changeOrderId_fkey` FOREIGN KEY (`changeOrderId`) REFERENCES `construction_change_orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `construction_change_lines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `changeOrderId` INTEGER NOT NULL,
    `itemId` INTEGER NOT NULL,
    `qtyDelta` DECIMAL(18, 3) NOT NULL,
    `price` DECIMAL(18, 4) NOT NULL,
    `amount` DECIMAL(18, 4) NOT NULL,

    INDEX `construction_change_lines_changeOrderId_idx`(`changeOrderId`),
    INDEX `construction_change_lines_itemId_idx`(`itemId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `construction_change_lines_changeOrderId_fkey` FOREIGN KEY (`changeOrderId`) REFERENCES `construction_change_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `construction_change_lines_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `construction_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `construction_certificates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contractId` INTEGER NOT NULL,
    `seq` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `periodFrom` DATE NULL,
    `periodTo` DATE NULL,
    `mode` VARCHAR(10) NOT NULL,
    `isFinal` BOOLEAN NOT NULL DEFAULT false,
    `gross` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `recovery` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `taxRate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `taxAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `invoiceTotal` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `retention` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `penalty` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `netPayable` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `saleId` INTEGER NULL,
    `purchaseId` INTEGER NULL,
    `penaltyVoucherId` INTEGER NULL,
    `notes` VARCHAR(1000) NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `construction_certificates_saleId_key`(`saleId`),
    UNIQUE INDEX `construction_certificates_purchaseId_key`(`purchaseId`),
    UNIQUE INDEX `construction_certificates_penaltyVoucherId_key`(`penaltyVoucherId`),
    UNIQUE INDEX `construction_certificates_contractId_seq_key`(`contractId`, `seq`),
    INDEX `construction_certificates_date_idx`(`date`),
    INDEX `construction_certificates_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`),
    CONSTRAINT `construction_certificates_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `construction_contracts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `construction_certificates_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `sales`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `construction_certificates_purchaseId_fkey` FOREIGN KEY (`purchaseId`) REFERENCES `purchases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `construction_certificates_penaltyVoucherId_fkey` FOREIGN KEY (`penaltyVoucherId`) REFERENCES `vouchers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `construction_certificates_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `construction_certificate_lines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `certificateId` INTEGER NOT NULL,
    `itemId` INTEGER NULL,
    `description` VARCHAR(500) NOT NULL,
    `unitName` VARCHAR(30) NULL,
    `qty` DECIMAL(18, 3) NOT NULL,
    `price` DECIMAL(18, 4) NOT NULL,
    `amount` DECIMAL(18, 4) NOT NULL,

    INDEX `construction_certificate_lines_certificateId_idx`(`certificateId`),
    INDEX `construction_certificate_lines_itemId_idx`(`itemId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `construction_certificate_lines_certificateId_fkey` FOREIGN KEY (`certificateId`) REFERENCES `construction_certificates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `construction_certificate_lines_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `construction_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `construction_payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contractId` INTEGER NOT NULL,
    `kind` VARCHAR(12) NOT NULL,
    `date` DATE NOT NULL,
    `amount` DECIMAL(18, 4) NOT NULL,
    `voucherId` INTEGER NOT NULL,
    `notes` VARCHAR(500) NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `construction_payments_voucherId_key`(`voucherId`),
    INDEX `construction_payments_contractId_idx`(`contractId`),
    INDEX `construction_payments_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`),
    CONSTRAINT `construction_payments_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `construction_contracts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `construction_payments_voucherId_fkey` FOREIGN KEY (`voucherId`) REFERENCES `vouchers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `construction_payments_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
