-- ------------------------------------------------------------
-- المغسلة (وحدة laundry) - المرحلة الأولى: الأصناف والخدمات والإضافات
-- - القطعة (ثوب، شماغ...) = صنف خدمة عادي، ويتعلّم إنه "صنف مغسلة"
-- - السعر = القطعة × الخدمة: عادي + مستعجل (المستعجل فاضي = مش متاح)
-- - الإضافات (نشا، مرزام، علّاق...) من غير أسعار، في مجموعات
-- ------------------------------------------------------------

-- خدمات المغسلة: غسيل، غسيل وكوي، كوي، كوي بالبخار...
CREATE TABLE `laundry_services` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `arName` VARCHAR(100) NOT NULL,
    `enName` VARCHAR(100) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `laundry_services_arName_key`(`arName`),
    UNIQUE INDEX `laundry_services_enName_key`(`enName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- أصناف المغسلة (القطع): صنف خدمة + ترتيبه في شاشة الاستلام
CREATE TABLE `laundry_items` (
    `productId` INTEGER NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `laundry_items` ADD CONSTRAINT `laundry_items_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- الأسعار: القطعة × الخدمة (السطر موجود = الخدمة متاحة للقطعة دي)
CREATE TABLE `laundry_prices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `serviceId` INTEGER NOT NULL,
    `price` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `urgentPrice` DECIMAL(18, 4) NULL,

    UNIQUE INDEX `laundry_prices_productId_serviceId_key`(`productId`, `serviceId`),
    INDEX `laundry_prices_serviceId_idx`(`serviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `laundry_prices` ADD CONSTRAINT `laundry_prices_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `laundry_items`(`productId`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `laundry_prices` ADD CONSTRAINT `laundry_prices_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `laundry_services`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- مجموعات الإضافات: multiple = يختار أكتر من واحدة (غير كده واحدة بس، زي النشا)
CREATE TABLE `laundry_addon_groups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `arName` VARCHAR(100) NOT NULL,
    `enName` VARCHAR(100) NOT NULL,
    `multiple` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `laundry_addon_groups_arName_key`(`arName`),
    UNIQUE INDEX `laundry_addon_groups_enName_key`(`enName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- الإضافات (من غير أسعار): نشا خفيف، مرزام، علّاق...
CREATE TABLE `laundry_addons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `groupId` INTEGER NOT NULL,
    `arName` VARCHAR(100) NOT NULL,
    `enName` VARCHAR(100) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `laundry_addons_groupId_arName_key`(`groupId`, `arName`),
    UNIQUE INDEX `laundry_addons_groupId_enName_key`(`groupId`, `enName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `laundry_addons` ADD CONSTRAINT `laundry_addons_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `laundry_addon_groups`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- بيانات البداية (بتتعدّل وتتمسح من الشاشة)
-- الجداول بتظهر بس للشركة اللي عندها وحدة المغسلة
-- ------------------------------------------------------------
INSERT IGNORE INTO `laundry_services` (`arName`, `enName`, `sortOrder`) VALUES
    ('غسيل', 'Wash', 1),
    ('غسيل وكي', 'Wash & iron', 2),
    ('كي', 'Iron', 3),
    ('كي بالبخار', 'Steam iron', 4);

INSERT IGNORE INTO `laundry_addon_groups` (`arName`, `enName`, `multiple`, `sortOrder`) VALUES
    ('النشا', 'Starch', false, 1),
    ('المرزام', 'Crease', false, 2),
    ('إضافات أخرى', 'Other', true, 3);

INSERT IGNORE INTO `laundry_addons` (`groupId`, `arName`, `enName`, `sortOrder`)
SELECT g.`id`, a.`arName`, a.`enName`, a.`sortOrder`
FROM `laundry_addon_groups` g
JOIN (
    SELECT 'النشا' AS grp, 'نشا خفيف' AS arName, 'Light starch' AS enName, 1 AS sortOrder
    UNION ALL SELECT 'النشا', 'نشا وسط', 'Medium starch', 2
    UNION ALL SELECT 'النشا', 'نشا ثقيل', 'Heavy starch', 3
    UNION ALL SELECT 'المرزام', 'مرزام', 'With crease', 1
    UNION ALL SELECT 'المرزام', 'بدون مرزام', 'Without crease', 2
    UNION ALL SELECT 'إضافات أخرى', 'علّاق', 'Hanger', 1
) a ON a.grp = g.`arName`;
