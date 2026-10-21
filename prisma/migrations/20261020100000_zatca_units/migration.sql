-- الربط مع الزكاة: وحدات الربط (EGS) لكل فرع + سجل العمليات
-- إضافة جداول جديدة فقط (بدون مسح أي بيانات)

CREATE TABLE `zatca_units` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branchId` INTEGER NOT NULL,
    `environment` VARCHAR(12) NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'draft',
    `commonName` VARCHAR(100) NOT NULL,
    `organizationUnitName` VARCHAR(100) NOT NULL,
    `invoiceType` VARCHAR(4) NOT NULL DEFAULT '1100',
    `locationAddress` VARCHAR(150) NOT NULL,
    `industry` VARCHAR(100) NOT NULL,
    `serialNumber` VARCHAR(150) NULL,
    `csr` TEXT NULL,
    `privateKeyEnc` TEXT NULL,
    `complianceRequestId` VARCHAR(50) NULL,
    `complianceCertificate` TEXT NULL,
    `complianceSecretEnc` TEXT NULL,
    `complianceChecks` JSON NULL,
    `productionRequestId` VARCHAR(50) NULL,
    `productionCertificate` TEXT NULL,
    `productionSecretEnc` TEXT NULL,
    `certSerial` VARCHAR(100) NULL,
    `certIssuedAt` DATETIME(3) NULL,
    `certExpiresAt` DATETIME(3) NULL,
    `onboardedAt` DATETIME(3) NULL,
    `icv` INTEGER NOT NULL DEFAULT 0,
    `lastHash` VARCHAR(100) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `zatca_units_branchId_key`(`branchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `zatca_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `unitId` INTEGER NOT NULL,
    `action` VARCHAR(30) NOT NULL,
    `environment` VARCHAR(12) NOT NULL,
    `success` BOOLEAN NOT NULL,
    `message` VARCHAR(1000) NULL,
    `details` JSON NULL,
    `userId` INTEGER NULL,
    `userName` VARCHAR(150) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `zatca_logs_unitId_createdAt_idx`(`unitId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `zatca_units` ADD CONSTRAINT `zatca_units_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `zatca_logs` ADD CONSTRAINT `zatca_logs_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `zatca_units`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
