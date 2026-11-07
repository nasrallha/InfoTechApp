-- ------------------------------------------------------------
-- السيارات (وحدة vehicles - الورش)
-- ------------------------------------------------------------
CREATE TABLE `vehicles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `plateNo` VARCHAR(30) NOT NULL,
    `plateKey` VARCHAR(30) NOT NULL,
    `vehicleType` VARCHAR(100) NULL,
    `customerId` INTEGER NULL,
    `phone` VARCHAR(30) NULL,
    `notes` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `vehicles_plateKey_key`(`plateKey`),
    INDEX `vehicles_customerId_idx`(`customerId`),
    INDEX `vehicles_vehicleType_idx`(`vehicleType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- السيارة في فاتورة البيع + قراءة العداد
ALTER TABLE `sales` ADD COLUMN `vehicleId` INTEGER NULL,
    ADD COLUMN `vehiclePlate` VARCHAR(30) NULL,
    ADD COLUMN `vehicleType` VARCHAR(100) NULL,
    ADD COLUMN `odometer` INTEGER NULL;
CREATE INDEX `sales_vehicleId_idx` ON `sales`(`vehicleId`);
ALTER TABLE `sales` ADD CONSTRAINT `sales_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- التغيير الدوري (زيت، فلتر...): في الصنف كل كام كم / كام شهر
ALTER TABLE `products` ADD COLUMN `changeKm` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `changeMonths` INTEGER NOT NULL DEFAULT 0;

-- الغيار الجاي على سطر الفاتورة
ALTER TABLE `sale_items` ADD COLUMN `nextKm` INTEGER NULL,
    ADD COLUMN `nextDate` DATE NULL;
