-- ------------------------------------------------------------
-- طاولات المطعم (لكل فرع) + حجز الطاولة في الطلب الأونلاين
-- - الطاولة: الاسم/الرقم وعدد الكراسي
-- - الطلب: tableId (الطاولة المحجوزة / المفتوحة) + partySize عدد الأفراد
-- - الطاولة مشغولة في ميعاد = عليها طلب (جديد / مفتوح) في نفس الفترة
--   (مدة الجلسة من الإعدادات restaurantTableMinutes)
-- ------------------------------------------------------------
CREATE TABLE `restaurant_tables` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branchId` INTEGER NOT NULL,
    `name` VARCHAR(30) NOT NULL,
    `seats` INTEGER NOT NULL DEFAULT 4,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `restaurant_tables_branchId_name_key`(`branchId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `restaurant_tables` ADD CONSTRAINT `restaurant_tables_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `restaurant_orders`
    ADD COLUMN `tableId` INTEGER NULL,
    ADD COLUMN `partySize` INTEGER NULL;

CREATE INDEX `restaurant_orders_tableId_idx` ON `restaurant_orders`(`tableId`);
ALTER TABLE `restaurant_orders` ADD CONSTRAINT `restaurant_orders_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `restaurant_tables`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- مدة جلسة الطاولة بالدقايق (الطاولة بتبقى محجوزة الفترة دي من ميعاد الوصول)
-- + حجز الطاولة من الطلب الأونلاين
ALTER TABLE `system_settings`
    ADD COLUMN `restaurantTableMinutes` INTEGER NOT NULL DEFAULT 90,
    ADD COLUMN `restaurantOnlineDineIn` BOOLEAN NOT NULL DEFAULT true;
