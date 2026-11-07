-- ------------------------------------------------------------
-- المغسلة (وحدة laundry) - المرحلة 2-أ: طلبات الاستلام
-- - رقم الطلب يومي (يبدأ من 1 كل يوم عمل) ولكل فرع لوحده
--   والـ id هو الرقم الفريد (اللي في باركود الإيصال)
-- - العميل إجباري (بالجوال)، ونسخة من اسمه وجواله وقت الاستلام
-- - حالة الشغل: received مستلَم | processing قيد التنفيذ | ready جاهز
--   | delivered مسلَّم | cancelled ملغي
-- - saleId: الفاتورة (المرحلة 2-ب)، فاتورة واحدة ممكن تجمع أكتر من طلب
-- ------------------------------------------------------------
CREATE TABLE `laundry_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branchId` INTEGER NOT NULL,
    `bizDay` DATE NOT NULL,
    `dailyNo` INTEGER NOT NULL,
    `customerId` INTEGER NOT NULL,
    `customerName` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(11) NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'received',
    `isUrgent` BOOLEAN NOT NULL DEFAULT false,
    `totalQty` INTEGER NOT NULL DEFAULT 0,
    `totalAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `notes` VARCHAR(500) NULL,
    `saleId` INTEGER NULL,
    `readyAt` DATETIME(3) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `deliveredById` INTEGER NULL,
    `cancelledAt` DATETIME(3) NULL,
    `cancelReason` VARCHAR(255) NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `laundry_orders_branchId_bizDay_dailyNo_key`(`branchId`, `bizDay`, `dailyNo`),
    INDEX `laundry_orders_bizDay_idx`(`bizDay`),
    INDEX `laundry_orders_customerId_idx`(`customerId`),
    INDEX `laundry_orders_phone_idx`(`phone`),
    INDEX `laundry_orders_status_idx`(`status`),
    INDEX `laundry_orders_saleId_idx`(`saleId`),
    INDEX `laundry_orders_deliveredById_idx`(`deliveredById`),
    INDEX `laundry_orders_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `laundry_orders` ADD CONSTRAINT `laundry_orders_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `laundry_orders` ADD CONSTRAINT `laundry_orders_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `laundry_orders` ADD CONSTRAINT `laundry_orders_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `sales`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `laundry_orders` ADD CONSTRAINT `laundry_orders_deliveredById_fkey` FOREIGN KEY (`deliveredById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `laundry_orders` ADD CONSTRAINT `laundry_orders_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- سطور الطلب: القطعة × الخدمة (عادي / مستعجل) × العدد + الإضافات
-- الأسماء والسعر نسخة وقت الاستلام (لو القائمة اتغيرت بعدين الطلب ما يتأثرش)
CREATE TABLE `laundry_order_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `serviceId` INTEGER NULL,
    `arName` VARCHAR(150) NOT NULL,
    `enName` VARCHAR(150) NOT NULL,
    `serviceArName` VARCHAR(100) NOT NULL,
    `serviceEnName` VARCHAR(100) NOT NULL,
    `isUrgent` BOOLEAN NOT NULL DEFAULT false,
    `qty` INTEGER NOT NULL DEFAULT 1,
    `price` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `total` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `addons` JSON NULL,
    `notes` VARCHAR(255) NULL,

    INDEX `laundry_order_items_orderId_idx`(`orderId`),
    INDEX `laundry_order_items_productId_idx`(`productId`),
    INDEX `laundry_order_items_serviceId_idx`(`serviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `laundry_order_items` ADD CONSTRAINT `laundry_order_items_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `laundry_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `laundry_order_items` ADD CONSTRAINT `laundry_order_items_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `laundry_order_items` ADD CONSTRAINT `laundry_order_items_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `laundry_services`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
