-- ------------------------------------------------------------
-- اسم مقدم الخدمة ثابت للنشاط (من اللوحة)
-- ------------------------------------------------------------
ALTER TABLE `subscription` ADD COLUMN `staffTitle` VARCHAR(12) NULL;

-- ------------------------------------------------------------
-- الحجوزات (وحدة bookings - الكوافير / الحلاق / المساج)
-- ------------------------------------------------------------
ALTER TABLE `products` ADD COLUMN `durationMin` INTEGER NOT NULL DEFAULT 0;

ALTER TABLE `system_settings` ADD COLUMN `bookingOnline` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `bookingOpen` VARCHAR(5) NOT NULL DEFAULT '10:00',
    ADD COLUMN `bookingClose` VARCHAR(5) NOT NULL DEFAULT '22:00',
    ADD COLUMN `bookingSlotMin` INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN `bookingDaysAhead` INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN `bookingHome` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `bookingNote` VARCHAR(500) NULL;

CREATE TABLE `bookings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `number` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,
    `customerId` INTEGER NULL,
    `customerName` VARCHAR(150) NOT NULL,
    `phone` VARCHAR(30) NOT NULL,
    `technicianId` INTEGER NULL,
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'booked',
    `atHome` BOOLEAN NOT NULL DEFAULT false,
    `address` VARCHAR(500) NULL,
    `locationUrl` VARCHAR(500) NULL,
    `notes` VARCHAR(500) NULL,
    `source` VARCHAR(10) NOT NULL DEFAULT 'staff',
    `saleId` INTEGER NULL,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bookings_number_key`(`number`),
    INDEX `bookings_startAt_idx`(`startAt`),
    INDEX `bookings_branchId_idx`(`branchId`),
    INDEX `bookings_customerId_idx`(`customerId`),
    INDEX `bookings_technicianId_idx`(`technicianId`),
    INDEX `bookings_phone_idx`(`phone`),
    INDEX `bookings_status_idx`(`status`),
    INDEX `bookings_saleId_idx`(`saleId`),
    INDEX `bookings_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `booking_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bookingId` INTEGER NOT NULL,
    `productId` INTEGER NULL,
    `arName` VARCHAR(255) NOT NULL,
    `enName` VARCHAR(255) NOT NULL,
    `price` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `durationMin` INTEGER NOT NULL DEFAULT 0,

    INDEX `booking_items_bookingId_idx`(`bookingId`),
    INDEX `booking_items_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `bookings` ADD CONSTRAINT `bookings_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_technicianId_fkey` FOREIGN KEY (`technicianId`) REFERENCES `technicians`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `sales`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `booking_items` ADD CONSTRAINT `booking_items_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `booking_items` ADD CONSTRAINT `booking_items_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
