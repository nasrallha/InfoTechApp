-- CreateTable
CREATE TABLE `roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `arName` VARCHAR(50) NOT NULL,
    `enName` VARCHAR(50) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_arName_key`(`arName`),
    UNIQUE INDEX `roles_enName_key`(`enName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `branches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `arName` VARCHAR(100) NOT NULL,
    `enName` VARCHAR(100) NOT NULL,
    `address` VARCHAR(255) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `branches_arName_key`(`arName`),
    UNIQUE INDEX `branches_enName_key`(`enName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `arFullname` VARCHAR(100) NOT NULL,
    `enFullname` VARCHAR(100) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `image` VARCHAR(255) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `roleId` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    INDEX `users_roleId_idx`(`roleId`),
    INDEX `users_branchId_idx`(`branchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `arName` VARCHAR(100) NOT NULL,
    `enName` VARCHAR(100) NOT NULL,
    `image` VARCHAR(255) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `parentId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `categories_arName_key`(`arName`),
    UNIQUE INDEX `categories_enName_key`(`enName`),
    INDEX `categories_parentId_idx`(`parentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `units` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `arName` VARCHAR(100) NOT NULL,
    `enName` VARCHAR(100) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `units_arName_key`(`arName`),
    UNIQUE INDEX `units_enName_key`(`enName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(50) NOT NULL,
    `arName` VARCHAR(150) NOT NULL,
    `enName` VARCHAR(150) NOT NULL,
    `image` VARCHAR(255) NULL,
    `cost` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `price` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `wholesalePrice` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `taxRate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `isPriceIncludeTax` BOOLEAN NOT NULL DEFAULT false,
    `startStock` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `categoryId` INTEGER NOT NULL,
    `baseUnitId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `products_code_key`(`code`),
    INDEX `products_categoryId_idx`(`categoryId`),
    INDEX `products_baseUnitId_idx`(`baseUnitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_units` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `unitId` INTEGER NOT NULL,
    `conversionFactor` DECIMAL(18, 4) NOT NULL DEFAULT 1,
    `barcode` VARCHAR(50) NULL,
    `cost` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `price` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `product_units_barcode_key`(`barcode`),
    INDEX `product_units_productId_idx`(`productId`),
    INDEX `product_units_unitId_idx`(`unitId`),
    UNIQUE INDEX `product_units_productId_unitId_key`(`productId`, `unitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` INTEGER NOT NULL,
    `arName` VARCHAR(255) NOT NULL,
    `enName` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(11) NULL,
    `taxNo` VARCHAR(15) NULL,
    `registrationNo` VARCHAR(10) NULL,
    `city` VARCHAR(100) NOT NULL,
    `district` VARCHAR(100) NOT NULL,
    `street` VARCHAR(100) NOT NULL,
    `buildingNo` VARCHAR(4) NULL,
    `additionalNo` VARCHAR(4) NULL,
    `postalCode` VARCHAR(5) NULL,
    `openingBalance` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customers_code_key`(`code`),
    UNIQUE INDEX `customers_phone_key`(`phone`),
    UNIQUE INDEX `customers_taxNo_key`(`taxNo`),
    UNIQUE INDEX `customers_registrationNo_key`(`registrationNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `suppliers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` INTEGER NOT NULL,
    `arName` VARCHAR(255) NOT NULL,
    `enName` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(11) NULL,
    `taxNo` VARCHAR(15) NULL,
    `registrationNo` VARCHAR(10) NULL,
    `city` VARCHAR(100) NOT NULL,
    `district` VARCHAR(100) NOT NULL,
    `street` VARCHAR(100) NOT NULL,
    `buildingNo` VARCHAR(4) NULL,
    `additionalNo` VARCHAR(4) NULL,
    `postalCode` VARCHAR(5) NULL,
    `openingBalance` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `suppliers_code_key`(`code`),
    UNIQUE INDEX `suppliers_phone_key`(`phone`),
    UNIQUE INDEX `suppliers_taxNo_key`(`taxNo`),
    UNIQUE INDEX `suppliers_registrationNo_key`(`registrationNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_baseUnitId_fkey` FOREIGN KEY (`baseUnitId`) REFERENCES `units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_units` ADD CONSTRAINT `product_units_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_units` ADD CONSTRAINT `product_units_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
