-- ------------------------------------------------------------
-- مقدمو الخدمة (الفنيون / العاملات / الحلاقون): العمولات واسمهم حسب النشاط
-- ------------------------------------------------------------
ALTER TABLE `technicians` ADD COLUMN `productRate` DECIMAL(5, 2) NOT NULL DEFAULT 0;

CREATE TABLE `technician_rates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `technicianId` INTEGER NOT NULL,
    `categoryId` INTEGER NULL,
    `productId` INTEGER NULL,
    `rateType` VARCHAR(10) NOT NULL DEFAULT 'percent',
    `value` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `technician_rates_technicianId_idx`(`technicianId`),
    INDEX `technician_rates_categoryId_idx`(`categoryId`),
    INDEX `technician_rates_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `technician_rates` ADD CONSTRAINT `technician_rates_technicianId_fkey` FOREIGN KEY (`technicianId`) REFERENCES `technicians`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `technician_rates` ADD CONSTRAINT `technician_rates_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `technician_rates` ADD CONSTRAINT `technician_rates_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- اسم مقدم الخدمة حسب النشاط
ALTER TABLE `system_settings` ADD COLUMN `staffTitle` VARCHAR(12) NOT NULL DEFAULT 'technician';
