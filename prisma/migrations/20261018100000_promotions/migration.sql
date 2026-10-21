-- العروض والخصومات لفترة (على الفاتورة / أقسام / أصناف)
-- إضافة جداول وأعمدة جديدة فقط (بدون مسح أي بيانات)

CREATE TABLE `promotions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `arName` VARCHAR(150) NOT NULL,
    `enName` VARCHAR(150) NOT NULL,
    `scope` VARCHAR(10) NOT NULL,
    `discountType` VARCHAR(12) NOT NULL,
    `value` DECIMAL(18, 4) NOT NULL,
    `minInvoice` DECIMAL(18, 4) NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `allBranches` BOOLEAN NOT NULL DEFAULT true,
    `notes` VARCHAR(500) NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `promotions_startDate_endDate_idx`(`startDate`, `endDate`),
    INDEX `promotions_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `promotion_branches` (
    `promotionId` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,

    INDEX `promotion_branches_branchId_idx`(`branchId`),
    PRIMARY KEY (`promotionId`, `branchId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `promotion_categories` (
    `promotionId` INTEGER NOT NULL,
    `categoryId` INTEGER NOT NULL,

    INDEX `promotion_categories_categoryId_idx`(`categoryId`),
    PRIMARY KEY (`promotionId`, `categoryId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `promotion_products` (
    `promotionId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,

    INDEX `promotion_products_productId_idx`(`productId`),
    PRIMARY KEY (`promotionId`, `productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- العرض المطبق على الفاتورة / السطر
ALTER TABLE `sales` ADD COLUMN `promotionId` INTEGER NULL;
ALTER TABLE `sale_items` ADD COLUMN `promotionId` INTEGER NULL;
ALTER TABLE `quotations` ADD COLUMN `promotionId` INTEGER NULL;
ALTER TABLE `quotation_items` ADD COLUMN `promotionId` INTEGER NULL;

CREATE INDEX `sales_promotionId_idx` ON `sales`(`promotionId`);
CREATE INDEX `sale_items_promotionId_idx` ON `sale_items`(`promotionId`);
CREATE INDEX `quotations_promotionId_idx` ON `quotations`(`promotionId`);
CREATE INDEX `quotation_items_promotionId_idx` ON `quotation_items`(`promotionId`);

ALTER TABLE `promotions` ADD CONSTRAINT `promotions_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `promotion_branches` ADD CONSTRAINT `promotion_branches_promotionId_fkey` FOREIGN KEY (`promotionId`) REFERENCES `promotions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `promotion_branches` ADD CONSTRAINT `promotion_branches_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `promotion_categories` ADD CONSTRAINT `promotion_categories_promotionId_fkey` FOREIGN KEY (`promotionId`) REFERENCES `promotions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `promotion_categories` ADD CONSTRAINT `promotion_categories_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `promotion_products` ADD CONSTRAINT `promotion_products_promotionId_fkey` FOREIGN KEY (`promotionId`) REFERENCES `promotions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `promotion_products` ADD CONSTRAINT `promotion_products_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `sales` ADD CONSTRAINT `sales_promotionId_fkey` FOREIGN KEY (`promotionId`) REFERENCES `promotions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_promotionId_fkey` FOREIGN KEY (`promotionId`) REFERENCES `promotions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `quotations` ADD CONSTRAINT `quotations_promotionId_fkey` FOREIGN KEY (`promotionId`) REFERENCES `promotions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `quotation_items` ADD CONSTRAINT `quotation_items_promotionId_fkey` FOREIGN KEY (`promotionId`) REFERENCES `promotions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
