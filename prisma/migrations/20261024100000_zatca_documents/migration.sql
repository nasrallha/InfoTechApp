-- الفواتير الإلكترونية (التوقيع والإرسال للزكاة) + إعدادات الإرسال
-- إضافة جداول جديدة فقط (بدون مسح أي بيانات)

CREATE TABLE `zatca_documents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `saleId` INTEGER NOT NULL,
    `unitId` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,
    `environment` VARCHAR(12) NOT NULL,
    `kind` VARCHAR(10) NOT NULL,
    `docType` VARCHAR(10) NOT NULL,
    `icv` INTEGER NOT NULL,
    `uuid` VARCHAR(36) NOT NULL,
    `pih` VARCHAR(100) NOT NULL,
    `hash` VARCHAR(100) NOT NULL,
    `qr` TEXT NOT NULL,
    `signedXml` MEDIUMTEXT NOT NULL,
    `clearedXml` MEDIUMTEXT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'pending',
    `zatcaStatus` VARCHAR(30) NULL,
    `httpStatus` INTEGER NULL,
    `warnings` JSON NULL,
    `errors` JSON NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastAttemptAt` DATETIME(3) NULL,
    `acceptedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `zatca_documents_saleId_key`(`saleId`),
    INDEX `zatca_documents_unitId_icv_idx`(`unitId`, `icv`),
    INDEX `zatca_documents_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `zatca_documents_branchId_createdAt_idx`(`branchId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `zatca_settings` (
    `id` INTEGER NOT NULL,
    `sendOnSave` BOOLEAN NOT NULL DEFAULT true,
    `autoSend` BOOLEAN NOT NULL DEFAULT true,
    `intervalMinutes` INTEGER NOT NULL DEFAULT 10,
    `alertTime` VARCHAR(5) NOT NULL DEFAULT '22:00',
    `alertThreshold` INTEGER NOT NULL DEFAULT 1,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `zatca_documents` ADD CONSTRAINT `zatca_documents_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `sales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `zatca_documents` ADD CONSTRAINT `zatca_documents_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `zatca_units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
