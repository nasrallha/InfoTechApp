-- الفنيون + الفني والموعد على سطر الخدمة + عقود الصيانة الدورية وزياراتها

-- CreateTable
CREATE TABLE `technicians` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `arName` VARCHAR(100) NOT NULL,
    `enName` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(30) NULL,
    `commissionRate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `notes` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `sale_items` ADD COLUMN `technicianId` INTEGER NULL,
    ADD COLUMN `jobAt` DATETIME(3) NULL,
    ADD COLUMN `jobAddress` VARCHAR(500) NULL,
    ADD COLUMN `jobStatus` VARCHAR(12) NULL,
    ADD COLUMN `jobDoneAt` DATETIME(3) NULL,
    ADD COLUMN `jobNote` VARCHAR(500) NULL;

-- CreateIndex
CREATE INDEX `sale_items_technicianId_idx` ON `sale_items`(`technicianId`);
CREATE INDEX `sale_items_jobAt_idx` ON `sale_items`(`jobAt`);

-- AddForeignKey
ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_technicianId_fkey` FOREIGN KEY (`technicianId`) REFERENCES `technicians`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE `maintenance_contracts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `number` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,
    `customerId` INTEGER NOT NULL,
    `productId` INTEGER NULL,
    `deviceName` VARCHAR(255) NOT NULL,
    `serialText` VARCHAR(100) NULL,
    `address` VARCHAR(500) NULL,
    `intervalMonths` INTEGER NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `amount` DECIMAL(18, 4) NULL,
    `technicianId` INTEGER NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'active',
    `notes` VARCHAR(1000) NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `maintenance_contracts_number_key`(`number`),
    INDEX `maintenance_contracts_branchId_idx`(`branchId`),
    INDEX `maintenance_contracts_customerId_idx`(`customerId`),
    INDEX `maintenance_contracts_productId_idx`(`productId`),
    INDEX `maintenance_contracts_technicianId_idx`(`technicianId`),
    INDEX `maintenance_contracts_createdById_idx`(`createdById`),
    INDEX `maintenance_contracts_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `maintenance_visits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contractId` INTEGER NOT NULL,
    `dueDate` DATE NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'pending',
    `doneAt` DATETIME(3) NULL,
    `note` VARCHAR(500) NULL,
    `technicianId` INTEGER NULL,

    INDEX `maintenance_visits_contractId_idx`(`contractId`),
    INDEX `maintenance_visits_dueDate_idx`(`dueDate`),
    INDEX `maintenance_visits_status_idx`(`status`),
    INDEX `maintenance_visits_technicianId_idx`(`technicianId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `maintenance_contracts` ADD CONSTRAINT `maintenance_contracts_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `maintenance_contracts` ADD CONSTRAINT `maintenance_contracts_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `maintenance_contracts` ADD CONSTRAINT `maintenance_contracts_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `maintenance_contracts` ADD CONSTRAINT `maintenance_contracts_technicianId_fkey` FOREIGN KEY (`technicianId`) REFERENCES `technicians`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `maintenance_contracts` ADD CONSTRAINT `maintenance_contracts_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `maintenance_visits` ADD CONSTRAINT `maintenance_visits_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `maintenance_contracts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `maintenance_visits` ADD CONSTRAINT `maintenance_visits_technicianId_fkey` FOREIGN KEY (`technicianId`) REFERENCES `technicians`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
