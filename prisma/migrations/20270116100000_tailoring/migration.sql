-- ------------------------------------------------------------
-- الخياط (وحدة tailoring)
-- أشخاص العميل ومقاساتهم | خانات المقاسات | مجموعات التفاصيل واختياراتها
-- طلبات التفصيل وسطورها (فاتورة بيع وقت الطلب)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `tailor_persons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customerId` INTEGER NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `kinship` VARCHAR(12) NOT NULL DEFAULT 'self',
    `notes` VARCHAR(500) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `tailor_persons_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `tailor_persons_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tailor_measurements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `personId` INTEGER NOT NULL,
    `measures` JSON NOT NULL,
    `notes` VARCHAR(500) NULL,
    `takenById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tailor_measurements_personId_idx`(`personId`),
    INDEX `tailor_measurements_takenById_idx`(`takenById`),
    PRIMARY KEY (`id`),
    CONSTRAINT `tailor_measurements_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `tailor_persons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `tailor_measurements_takenById_fkey` FOREIGN KEY (`takenById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tailor_fields` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `arName` VARCHAR(60) NOT NULL,
    `enName` VARCHAR(60) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tailor_style_groups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `arName` VARCHAR(60) NOT NULL,
    `enName` VARCHAR(60) NOT NULL,
    `multiple` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tailor_style_choices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `groupId` INTEGER NOT NULL,
    `arName` VARCHAR(60) NOT NULL,
    `enName` VARCHAR(60) NOT NULL,
    `image` VARCHAR(255) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `tailor_style_choices_groupId_idx`(`groupId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `tailor_style_choices_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `tailor_style_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tailor_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `number` INTEGER NOT NULL,
    `docCode` VARCHAR(10) NULL,
    `branchId` INTEGER NOT NULL,
    `customerId` INTEGER NOT NULL,
    `orderDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deliveryDate` DATE NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'new',
    `technicianId` INTEGER NULL,
    `saleId` INTEGER NULL,
    `totalAmount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `notes` VARCHAR(1000) NULL,
    `readyAt` DATETIME(3) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `cancelReason` VARCHAR(255) NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tailor_orders_saleId_key`(`saleId`),
    UNIQUE INDEX `tailor_orders_branchId_number_key`(`branchId`, `number`),
    INDEX `tailor_orders_customerId_idx`(`customerId`),
    INDEX `tailor_orders_technicianId_idx`(`technicianId`),
    INDEX `tailor_orders_createdById_idx`(`createdById`),
    INDEX `tailor_orders_status_idx`(`status`),
    INDEX `tailor_orders_deliveryDate_idx`(`deliveryDate`),
    INDEX `tailor_orders_orderDate_idx`(`orderDate`),
    PRIMARY KEY (`id`),
    CONSTRAINT `tailor_orders_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `tailor_orders_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `tailor_orders_technicianId_fkey` FOREIGN KEY (`technicianId`) REFERENCES `technicians`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `tailor_orders_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `sales`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `tailor_orders_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tailor_order_lines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `personId` INTEGER NULL,
    `personName` VARCHAR(150) NOT NULL,
    `measurementId` INTEGER NULL,
    `measures` JSON NOT NULL,
    `styles` JSON NOT NULL,
    `fabricId` INTEGER NULL,
    `fabricName` VARCHAR(255) NULL,
    `fabricQty` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `fabricPrice` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `pieces` INTEGER NOT NULL DEFAULT 1,
    `sewPrice` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `notes` VARCHAR(500) NULL,

    INDEX `tailor_order_lines_orderId_idx`(`orderId`),
    INDEX `tailor_order_lines_personId_idx`(`personId`),
    INDEX `tailor_order_lines_measurementId_idx`(`measurementId`),
    INDEX `tailor_order_lines_fabricId_idx`(`fabricId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `tailor_order_lines_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `tailor_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `tailor_order_lines_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `tailor_persons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `tailor_order_lines_measurementId_fkey` FOREIGN KEY (`measurementId`) REFERENCES `tailor_measurements`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `tailor_order_lines_fabricId_fkey` FOREIGN KEY (`fabricId`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- الإعدادات: سعر تفصيل الثوب الافتراضي + قسم الأقمشة
ALTER TABLE `system_settings`
    ADD COLUMN `tailorSewPrice` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    ADD COLUMN `tailorFabricCategoryId` INTEGER NULL;

-- ------------------------------------------------------------
-- البيانات الأولى (من كارت الخياط) - مرة واحدة بس (لو الجداول فاضية)
-- ------------------------------------------------------------
INSERT INTO `tailor_fields` (`arName`, `enName`, `sortOrder`, `updatedAt`)
SELECT * FROM (
    SELECT 'الطول' AS a, 'Length' AS e, 1 AS s, CURRENT_TIMESTAMP(3) AS u UNION ALL
    SELECT 'الكتف', 'Shoulder', 2, CURRENT_TIMESTAMP(3) UNION ALL
    SELECT 'اليد', 'Sleeve', 3, CURRENT_TIMESTAMP(3) UNION ALL
    SELECT 'الرقبة', 'Neck', 4, CURRENT_TIMESTAMP(3) UNION ALL
    SELECT 'الوسع', 'Width', 5, CURRENT_TIMESTAMP(3) UNION ALL
    SELECT 'وسع الصدر', 'Chest', 6, CURRENT_TIMESTAMP(3) UNION ALL
    SELECT 'وسط اليد', 'Mid sleeve', 7, CURRENT_TIMESTAMP(3) UNION ALL
    SELECT 'قبل الكبك', 'Before cuff', 8, CURRENT_TIMESTAMP(3)
) AS x
WHERE NOT EXISTS (SELECT 1 FROM `tailor_fields`);

INSERT INTO `tailor_style_groups` (`id`, `arName`, `enName`, `multiple`, `sortOrder`, `updatedAt`)
SELECT * FROM (
    SELECT 1 AS i, 'الموديل' AS a, 'Model' AS e, false AS m, 1 AS s, CURRENT_TIMESTAMP(3) AS u UNION ALL
    SELECT 2, 'الرقبة', 'Collar', false, 2, CURRENT_TIMESTAMP(3) UNION ALL
    SELECT 3, 'الكبك', 'Cuff', false, 3, CURRENT_TIMESTAMP(3) UNION ALL
    SELECT 4, 'الجبزور', 'Placket', false, 4, CURRENT_TIMESTAMP(3) UNION ALL
    SELECT 5, 'الجيب', 'Pocket', false, 5, CURRENT_TIMESTAMP(3) UNION ALL
    SELECT 6, 'المخابي', 'Side pockets', false, 6, CURRENT_TIMESTAMP(3) UNION ALL
    SELECT 7, 'إضافات', 'Extras', true, 7, CURRENT_TIMESTAMP(3)
) AS x
WHERE NOT EXISTS (SELECT 1 FROM `tailor_style_groups`);

INSERT INTO `tailor_style_choices` (`groupId`, `arName`, `enName`, `sortOrder`, `updatedAt`)
SELECT x.g, x.a, x.e, x.s, CURRENT_TIMESTAMP(3) FROM (
    SELECT 1 AS g, 'حجازي' AS a, 'Hijazi' AS e, 1 AS s UNION ALL
    SELECT 1, 'كويتي', 'Kuwaiti', 2 UNION ALL
    SELECT 1, 'قطري', 'Qatari', 3 UNION ALL
    SELECT 1, 'غزاوي', 'Ghazawi', 4 UNION ALL
    SELECT 2, 'رقبة عادية', 'Regular collar', 1 UNION ALL
    SELECT 2, 'رقبة صيني', 'Mandarin collar', 2 UNION ALL
    SELECT 2, 'رقبة مدورة', 'Round collar', 3 UNION ALL
    SELECT 2, 'رقبة بزرارين', 'Two-button collar', 4 UNION ALL
    SELECT 3, 'كبك عادي', 'Regular cuff', 1 UNION ALL
    SELECT 3, 'كبك مشطوف', 'Angled cuff', 2 UNION ALL
    SELECT 3, 'كبك مدور', 'Round cuff', 3 UNION ALL
    SELECT 3, 'كبك بزرار', 'Button cuff', 4 UNION ALL
    SELECT 4, 'سحاب', 'Zipper', 1 UNION ALL
    SELECT 4, 'مخفي', 'Hidden', 2 UNION ALL
    SELECT 4, 'أزرار ظاهرة', 'Visible buttons', 3 UNION ALL
    SELECT 4, 'مخفي بأزرار', 'Hidden buttons', 4 UNION ALL
    SELECT 5, 'جيب عادي', 'Regular pocket', 1 UNION ALL
    SELECT 5, 'جيب مدور', 'Round pocket', 2 UNION ALL
    SELECT 5, 'جيب مشطوف', 'Angled pocket', 3 UNION ALL
    SELECT 5, 'جيب بغطاء', 'Flap pocket', 4 UNION ALL
    SELECT 6, 'مخابي كبس', 'Snap side pockets', 1 UNION ALL
    SELECT 6, 'مخابي عادي', 'Regular side pockets', 2 UNION ALL
    SELECT 6, 'مخابي مخفي', 'Hidden side pockets', 3 UNION ALL
    SELECT 7, 'جيب جوال', 'Phone pocket', 1 UNION ALL
    SELECT 7, 'جيب قلم', 'Pen pocket', 2
) AS x
WHERE EXISTS (SELECT 1 FROM `tailor_style_groups` WHERE `id` = x.g)
  AND NOT EXISTS (SELECT 1 FROM `tailor_style_choices`);
