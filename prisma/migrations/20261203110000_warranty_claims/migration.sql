-- طلبات الضمان والصيانة + قطع الغيار والمصنعية + سجل الطلب

-- CreateTable
CREATE TABLE `warranty_claims` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `number` INTEGER NOT NULL,
    `kind` VARCHAR(10) NOT NULL DEFAULT 'warranty',
    `status` VARCHAR(12) NOT NULL DEFAULT 'received',
    `branchId` INTEGER NOT NULL,
    `customerId` INTEGER NULL,
    `customerName` VARCHAR(255) NULL,
    `customerPhone` VARCHAR(30) NULL,
    `productId` INTEGER NULL,
    `deviceName` VARCHAR(255) NULL,
    `serialId` INTEGER NULL,
    `serialText` VARCHAR(100) NULL,
    `serial2Text` VARCHAR(100) NULL,
    `inWarranty` BOOLEAN NOT NULL DEFAULT false,
    `warrantyEndsAt` DATE NULL,
    `fault` VARCHAR(1000) NOT NULL,
    `accessories` JSON NULL,
    `accessoriesOther` VARCHAR(255) NULL,
    `condition` VARCHAR(500) NULL,
    `expectedAt` DATE NULL,
    `estimate` DECIMAL(18, 4) NULL,
    `supplierId` INTEGER NULL,
    `sentAt` DATETIME(3) NULL,
    `agentRef` VARCHAR(100) NULL,
    `backAt` DATETIME(3) NULL,
    `result` VARCHAR(12) NULL,
    `resultNote` VARCHAR(500) NULL,
    `newSerialId` INTEGER NULL,
    `saleId` INTEGER NULL,
    `deliveredAt` DATETIME(3) NULL,
    `notes` VARCHAR(1000) NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `warranty_claims_number_key`(`number`),
    UNIQUE INDEX `warranty_claims_saleId_key`(`saleId`),
    INDEX `warranty_claims_status_idx`(`status`),
    INDEX `warranty_claims_branchId_idx`(`branchId`),
    INDEX `warranty_claims_customerId_idx`(`customerId`),
    INDEX `warranty_claims_productId_idx`(`productId`),
    INDEX `warranty_claims_serialId_idx`(`serialId`),
    INDEX `warranty_claims_supplierId_idx`(`supplierId`),
    INDEX `warranty_claims_createdById_idx`(`createdById`),
    INDEX `warranty_claims_newSerialId_idx`(`newSerialId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `warranty_claim_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `claimId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `unitId` INTEGER NOT NULL,
    `qty` DECIMAL(18, 3) NOT NULL,
    `price` DECIMAL(18, 4) NOT NULL,
    `note` VARCHAR(500) NULL,

    INDEX `warranty_claim_items_claimId_idx`(`claimId`),
    INDEX `warranty_claim_items_productId_idx`(`productId`),
    INDEX `warranty_claim_items_unitId_idx`(`unitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `warranty_claim_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `claimId` INTEGER NOT NULL,
    `status` VARCHAR(12) NOT NULL,
    `note` VARCHAR(500) NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `warranty_claim_logs_claimId_idx`(`claimId`),
    INDEX `warranty_claim_logs_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `warranty_claims` ADD CONSTRAINT `warranty_claims_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `warranty_claims` ADD CONSTRAINT `warranty_claims_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `warranty_claims` ADD CONSTRAINT `warranty_claims_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `warranty_claims` ADD CONSTRAINT `warranty_claims_serialId_fkey` FOREIGN KEY (`serialId`) REFERENCES `product_serials`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `warranty_claims` ADD CONSTRAINT `warranty_claims_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `warranty_claims` ADD CONSTRAINT `warranty_claims_newSerialId_fkey` FOREIGN KEY (`newSerialId`) REFERENCES `product_serials`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `warranty_claims` ADD CONSTRAINT `warranty_claims_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `sales`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `warranty_claims` ADD CONSTRAINT `warranty_claims_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `warranty_claim_items` ADD CONSTRAINT `warranty_claim_items_claimId_fkey` FOREIGN KEY (`claimId`) REFERENCES `warranty_claims`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `warranty_claim_items` ADD CONSTRAINT `warranty_claim_items_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `warranty_claim_items` ADD CONSTRAINT `warranty_claim_items_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `warranty_claim_logs` ADD CONSTRAINT `warranty_claim_logs_claimId_fkey` FOREIGN KEY (`claimId`) REFERENCES `warranty_claims`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `warranty_claim_logs` ADD CONSTRAINT `warranty_claim_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
