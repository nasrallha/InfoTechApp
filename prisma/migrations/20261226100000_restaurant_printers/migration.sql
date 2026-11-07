-- ------------------------------------------------------------
-- طابعات المطعم (لكل فرع) وتوزيع التحضير عليها
-- - kind: cashier الكاشير (الفاتورة) | kitchen تحضير
-- - connection: network شبكة (host:port، افتراضي 9100) | windows طابعة ويندوز بالاسم
--               | browser المتصفح (لحد ما وسيط الطباعة يشتغل)
-- - طابعة التحضير بتطبع أقسامها (printer_categories)، والصنف ممكن يتحدد له طابعة
--   غير قسمه (printer_products)، والباقي على الطابعة الافتراضية (isDefault)
-- ------------------------------------------------------------
CREATE TABLE `restaurant_printers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branchId` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `kind` VARCHAR(10) NOT NULL DEFAULT 'kitchen',
    `connection` VARCHAR(10) NOT NULL DEFAULT 'network',
    `host` VARCHAR(100) NULL,
    `port` INTEGER NOT NULL DEFAULT 9100,
    `windowsName` VARCHAR(150) NULL,
    `paperSize` VARCHAR(10) NOT NULL DEFAULT '80mm',
    `copies` INTEGER NOT NULL DEFAULT 1,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `restaurant_printers_branchId_name_key`(`branchId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `restaurant_printers` ADD CONSTRAINT `restaurant_printers_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `restaurant_printer_categories` (
    `printerId` INTEGER NOT NULL,
    `categoryId` INTEGER NOT NULL,

    INDEX `restaurant_printer_categories_categoryId_idx`(`categoryId`),
    PRIMARY KEY (`printerId`, `categoryId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `restaurant_printer_categories` ADD CONSTRAINT `restaurant_printer_categories_printerId_fkey` FOREIGN KEY (`printerId`) REFERENCES `restaurant_printers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `restaurant_printer_categories` ADD CONSTRAINT `restaurant_printer_categories_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `restaurant_printer_products` (
    `printerId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,

    INDEX `restaurant_printer_products_productId_idx`(`productId`),
    PRIMARY KEY (`printerId`, `productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `restaurant_printer_products` ADD CONSTRAINT `restaurant_printer_products_printerId_fkey` FOREIGN KEY (`printerId`) REFERENCES `restaurant_printers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `restaurant_printer_products` ADD CONSTRAINT `restaurant_printer_products_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
