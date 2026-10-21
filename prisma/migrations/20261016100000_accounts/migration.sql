-- الحسابات: سندات القبض والصرف والتسوية، بنود المصروفات، حركات الدرج،
-- وتطوير الوردية (الاستلام، عدّ الفئات، الشبكة، التوريد)
-- إضافة جداول وأعمدة جديدة فقط (بدون مسح أي بيانات)

-- المسدد بعد الفاتورة بسندات
ALTER TABLE `sales` ADD COLUMN `settledAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0;
ALTER TABLE `purchases` ADD COLUMN `settledAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0;

-- الوردية
ALTER TABLE `shifts`
    ADD COLUMN `previousShiftId` INTEGER NULL,
    ADD COLUMN `expectedOpening` DECIMAL(18, 4) NULL,
    ADD COLUMN `openingDifference` DECIMAL(18, 4) NULL,
    ADD COLUMN `denominations` JSON NULL,
    ADD COLUMN `cardExpected` DECIMAL(18, 4) NULL,
    ADD COLUMN `cardCounted` DECIMAL(18, 4) NULL,
    ADD COLUMN `cardDifference` DECIMAL(18, 4) NULL,
    ADD COLUMN `depositedCash` DECIMAL(18, 4) NULL,
    ADD COLUMN `leftCash` DECIMAL(18, 4) NULL;

CREATE TABLE `expense_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `arName` VARCHAR(100) NOT NULL,
    `enName` VARCHAR(100) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `expense_categories_arName_key`(`arName`),
    UNIQUE INDEX `expense_categories_enName_key`(`enName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `vouchers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(12) NOT NULL,
    `number` INTEGER NOT NULL,
    `partyType` VARCHAR(10) NOT NULL,
    `branchId` INTEGER NOT NULL,
    `shiftId` INTEGER NULL,
    `customerId` INTEGER NULL,
    `supplierId` INTEGER NULL,
    `expenseCategoryId` INTEGER NULL,
    `partyArName` VARCHAR(255) NULL,
    `partyEnName` VARCHAR(255) NULL,
    `paymentMethodId` INTEGER NULL,
    `amount` DECIMAL(18, 4) NOT NULL,
    `reference` VARCHAR(100) NULL,
    `date` DATETIME(3) NOT NULL,
    `notes` VARCHAR(500) NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `vouchers_type_number_key`(`type`, `number`),
    INDEX `vouchers_branchId_idx`(`branchId`),
    INDEX `vouchers_shiftId_idx`(`shiftId`),
    INDEX `vouchers_customerId_idx`(`customerId`),
    INDEX `vouchers_supplierId_idx`(`supplierId`),
    INDEX `vouchers_expenseCategoryId_idx`(`expenseCategoryId`),
    INDEX `vouchers_paymentMethodId_idx`(`paymentMethodId`),
    INDEX `vouchers_createdById_idx`(`createdById`),
    INDEX `vouchers_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voucher_allocations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `voucherId` INTEGER NOT NULL,
    `saleId` INTEGER NULL,
    `purchaseId` INTEGER NULL,
    `amount` DECIMAL(18, 4) NOT NULL,

    INDEX `voucher_allocations_voucherId_idx`(`voucherId`),
    INDEX `voucher_allocations_saleId_idx`(`saleId`),
    INDEX `voucher_allocations_purchaseId_idx`(`purchaseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `cash_movements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(5) NOT NULL,
    `shiftId` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,
    `amount` DECIMAL(18, 4) NOT NULL,
    `reason` VARCHAR(255) NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `cash_movements_shiftId_idx`(`shiftId`),
    INDEX `cash_movements_branchId_idx`(`branchId`),
    INDEX `cash_movements_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `vouchers` ADD CONSTRAINT `vouchers_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `vouchers` ADD CONSTRAINT `vouchers_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `shifts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `vouchers` ADD CONSTRAINT `vouchers_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `vouchers` ADD CONSTRAINT `vouchers_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `vouchers` ADD CONSTRAINT `vouchers_expenseCategoryId_fkey` FOREIGN KEY (`expenseCategoryId`) REFERENCES `expense_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `vouchers` ADD CONSTRAINT `vouchers_paymentMethodId_fkey` FOREIGN KEY (`paymentMethodId`) REFERENCES `payment_methods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `vouchers` ADD CONSTRAINT `vouchers_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `voucher_allocations` ADD CONSTRAINT `voucher_allocations_voucherId_fkey` FOREIGN KEY (`voucherId`) REFERENCES `vouchers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `voucher_allocations` ADD CONSTRAINT `voucher_allocations_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `sales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `voucher_allocations` ADD CONSTRAINT `voucher_allocations_purchaseId_fkey` FOREIGN KEY (`purchaseId`) REFERENCES `purchases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `cash_movements` ADD CONSTRAINT `cash_movements_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `shifts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `cash_movements` ADD CONSTRAINT `cash_movements_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `cash_movements` ADD CONSTRAINT `cash_movements_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- بنود مصروفات افتراضية (يمكن تعديلها أو إضافة غيرها)
INSERT INTO `expense_categories` (`arName`, `enName`, `updatedAt`) VALUES
    ('إيجار', 'Rent', CURRENT_TIMESTAMP(3)),
    ('رواتب', 'Salaries', CURRENT_TIMESTAMP(3)),
    ('كهرباء ومياه', 'Utilities', CURRENT_TIMESTAMP(3)),
    ('نقل ومواصلات', 'Transport', CURRENT_TIMESTAMP(3)),
    ('مصروفات متنوعة', 'Miscellaneous', CURRENT_TIMESTAMP(3));

INSERT INTO `document_sequences` (`key`, `last`) VALUES
    ('receipt', 0),
    ('payment', 0),
    ('settlement', 0)
ON DUPLICATE KEY UPDATE `last` = `last`;
