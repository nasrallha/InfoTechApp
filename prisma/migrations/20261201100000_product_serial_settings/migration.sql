-- إعدادات الأرقام التسلسلية والضمان للأصناف + إلزامها عند البيع

-- AlterTable
ALTER TABLE `products` ADD COLUMN `serialCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `serialLabel1` VARCHAR(40) NULL,
    ADD COLUMN `serialLabel2` VARCHAR(40) NULL,
    ADD COLUMN `warrantyMonths` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `warrantyType` VARCHAR(10) NULL;

-- AlterTable
ALTER TABLE `system_settings` ADD COLUMN `serialRequired` BOOLEAN NOT NULL DEFAULT true;
