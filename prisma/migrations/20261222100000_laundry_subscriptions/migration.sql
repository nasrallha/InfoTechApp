-- ------------------------------------------------------------
-- المغسلة (وحدة laundry) - المرحلة 2-ج: الاشتراكات
-- - الاشتراك = رصيد للعميل: يدفع 100 ويتشحن له 130 (paid / credit)
-- - الفلوس بتدخل بسند قبض (إيراد متنوع) على الدرج، والرصيد بيتصرف في فواتير الكاشير
-- - الصرف بالأقدم (FIFO) وكل صرف متسجل ومربوط بفاتورته
-- - مكافأة الاشتراك (الـ 30) بتنزل خصم في الفاتورة (إعداد)
-- - مدة الاشتراك (إعداد): 0 = لحد ما الرصيد يخلص، غير كده بيخلص بعد كام شهر
-- ------------------------------------------------------------
CREATE TABLE `laundry_wallets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `number` INTEGER NOT NULL,
    `customerId` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,
    `paidAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `creditAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `remaining` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `expiresAt` DATE NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'active',
    `voucherId` INTEGER NULL,
    `notes` VARCHAR(255) NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `laundry_wallets_number_key`(`number`),
    UNIQUE INDEX `laundry_wallets_voucherId_key`(`voucherId`),
    INDEX `laundry_wallets_customerId_status_idx`(`customerId`, `status`),
    INDEX `laundry_wallets_branchId_idx`(`branchId`),
    INDEX `laundry_wallets_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `laundry_wallets` ADD CONSTRAINT `laundry_wallets_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `laundry_wallets` ADD CONSTRAINT `laundry_wallets_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `laundry_wallets` ADD CONSTRAINT `laundry_wallets_voucherId_fkey` FOREIGN KEY (`voucherId`) REFERENCES `vouchers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `laundry_wallets` ADD CONSTRAINT `laundry_wallets_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- الصرف من الاشتراك: credit = اللي اتخصم من الرصيد، value = اللي اتدفع بيه
-- في الفاتورة، bonus = خصم المكافأة (credit = value + bonus)
CREATE TABLE `laundry_wallet_uses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `walletId` INTEGER NOT NULL,
    `saleId` INTEGER NOT NULL,
    `credit` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `value` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `bonus` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `laundry_wallet_uses_walletId_idx`(`walletId`),
    INDEX `laundry_wallet_uses_saleId_idx`(`saleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `laundry_wallet_uses` ADD CONSTRAINT `laundry_wallet_uses_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `laundry_wallets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `laundry_wallet_uses` ADD CONSTRAINT `laundry_wallet_uses_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `sales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- إعدادات الاشتراك
ALTER TABLE `system_settings`
    ADD COLUMN `laundryWalletMonths` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `laundryBonusDiscount` BOOLEAN NOT NULL DEFAULT true;
