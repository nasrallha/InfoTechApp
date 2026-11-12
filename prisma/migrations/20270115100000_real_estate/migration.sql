-- ------------------------------------------------------------
-- تأجير العقارات (وحدة realEstate)
-- الملّاك ← العقارات ← الوحدات | نماذج صيغة العقد | العقود ووحداتها | جدول الدفعات
-- كل دفعة: فاتورة ضريبية (فاتورة بيع) بفترة السداد - السكني معفى والتجاري بالضريبة
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `property_owners` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `idNumber` VARCHAR(30) NULL,
    `notes` VARCHAR(500) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `properties` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `city` VARCHAR(100) NULL,
    `district` VARCHAR(100) NULL,
    `address` VARCHAR(255) NULL,
    `notes` VARCHAR(500) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `ownerId` INTEGER NULL,
    `branchId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `properties_branchId_name_key`(`branchId`, `name`),
    INDEX `properties_ownerId_idx`(`ownerId`),
    INDEX `properties_branchId_idx`(`branchId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `properties_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `property_owners`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `properties_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rent_units` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `propertyId` INTEGER NOT NULL,
    `unitNo` VARCHAR(30) NOT NULL,
    `kind` VARCHAR(15) NOT NULL,
    `useType` VARCHAR(12) NOT NULL,
    `floor` VARCHAR(20) NULL,
    `area` DECIMAL(10, 2) NULL,
    `annualRent` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `details` JSON NULL,
    `notes` VARCHAR(500) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `rent_units_propertyId_unitNo_key`(`propertyId`, `unitNo`),
    PRIMARY KEY (`id`),
    CONSTRAINT `rent_units_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rent_contract_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `useType` VARCHAR(12) NULL,
    `content` TEXT NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rent_contracts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `number` INTEGER NOT NULL,
    `docCode` VARCHAR(10) NULL,
    `ejarNo` VARCHAR(40) NULL,
    `branchId` INTEGER NOT NULL,
    `customerId` INTEGER NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `payEvery` INTEGER NOT NULL,
    `totalAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `status` VARCHAR(12) NOT NULL DEFAULT 'active',
    `exitDate` DATE NULL,
    `exitReason` VARCHAR(255) NULL,
    `renewedFromId` INTEGER NULL,
    `templateId` INTEGER NULL,
    `content` TEXT NULL,
    `notes` VARCHAR(1000) NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `rent_contracts_branchId_number_key`(`branchId`, `number`),
    INDEX `rent_contracts_customerId_idx`(`customerId`),
    INDEX `rent_contracts_status_idx`(`status`),
    INDEX `rent_contracts_endDate_idx`(`endDate`),
    INDEX `rent_contracts_createdById_idx`(`createdById`),
    INDEX `rent_contracts_templateId_idx`(`templateId`),
    INDEX `rent_contracts_renewedFromId_idx`(`renewedFromId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `rent_contracts_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `rent_contracts_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `rent_contracts_renewedFromId_fkey` FOREIGN KEY (`renewedFromId`) REFERENCES `rent_contracts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `rent_contracts_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `rent_contract_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `rent_contracts_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rent_contract_units` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contractId` INTEGER NOT NULL,
    `unitId` INTEGER NOT NULL,
    `annualRent` DECIMAL(18, 4) NOT NULL,

    UNIQUE INDEX `rent_contract_units_contractId_unitId_key`(`contractId`, `unitId`),
    INDEX `rent_contract_units_unitId_idx`(`unitId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `rent_contract_units_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `rent_contracts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `rent_contract_units_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `rent_units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rent_installments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contractId` INTEGER NOT NULL,
    `seq` INTEGER NOT NULL,
    `periodFrom` DATE NOT NULL,
    `periodTo` DATE NOT NULL,
    `dueDate` DATE NOT NULL,
    `amount` DECIMAL(18, 4) NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'due',
    `saleId` INTEGER NULL,

    UNIQUE INDEX `rent_installments_saleId_key`(`saleId`),
    UNIQUE INDEX `rent_installments_contractId_seq_key`(`contractId`, `seq`),
    INDEX `rent_installments_dueDate_idx`(`dueDate`),
    INDEX `rent_installments_status_idx`(`status`),
    PRIMARY KEY (`id`),
    CONSTRAINT `rent_installments_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `rent_contracts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `rent_installments_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `sales`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
