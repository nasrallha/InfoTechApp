-- ------------------------------------------------------------
-- المطعم / المقهى (وحدة restaurant) - المرحلة 1-أ: المنيو
-- - الصنف = صنف عادي + سطر هنا (صنف مطعم): ترتيبه وهل عليه رسوم تبغ
-- - الأحجام: صغير / وسط / كبير ... وكل صنف ليه سعر لكل حجم
--   (الصنف من غير أحجام: سعره العادي)
-- - الإضافات: مجموعات بحد أدنى وأقصى للاختيار (أدنى 1 = إجباري)
--   وكل إضافة ليها سعر (0 = مجاناً)، والمجموعة مربوطة بأصنافها
-- - التطبيقات (هنقرستيشن، جاهز...): من لوحة التحكم (templateKey)
--   زيادة على السعر (نسبة أو مبلغ) + عمولة التطبيق، والصنف ممكن يتكتب له سعر خاص
-- - الرسوم (كل واحدة سطر في الفاتورة بصنف خدمة، عليه ضريبة عادي):
--   رسوم الخدمة (نسبة افتراضية وتتغير في الفاتورة)، رسوم التوصيل (مبلغ)،
--   رسوم التبغ (نسبة على صافي أصناف التبغ: الشيشة...)
-- - السائقين: مين وصّل الطلب + عمولته (نسبة من رسوم التوصيل أو مبلغ على الطلب)
-- ------------------------------------------------------------
CREATE TABLE `restaurant_items` (
    `productId` INTEGER NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isTobacco` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `restaurant_items` ADD CONSTRAINT `restaurant_items_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `restaurant_sizes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `arName` VARCHAR(100) NOT NULL,
    `enName` VARCHAR(100) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `restaurant_sizes_arName_key`(`arName`),
    UNIQUE INDEX `restaurant_sizes_enName_key`(`enName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- سعر الصنف لكل حجم (السطر موجود = الحجم متاح للصنف)
CREATE TABLE `restaurant_item_sizes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `sizeId` INTEGER NOT NULL,
    `price` DECIMAL(18, 4) NOT NULL DEFAULT 0,

    UNIQUE INDEX `restaurant_item_sizes_productId_sizeId_key`(`productId`, `sizeId`),
    INDEX `restaurant_item_sizes_sizeId_idx`(`sizeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `restaurant_item_sizes` ADD CONSTRAINT `restaurant_item_sizes_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `restaurant_items`(`productId`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `restaurant_item_sizes` ADD CONSTRAINT `restaurant_item_sizes_sizeId_fkey` FOREIGN KEY (`sizeId`) REFERENCES `restaurant_sizes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- مجموعات الإضافات: minSelect (0 = اختياري، 1+ = إجباري)، maxSelect (0 = بدون حد)
CREATE TABLE `restaurant_modifier_groups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `arName` VARCHAR(100) NOT NULL,
    `enName` VARCHAR(100) NOT NULL,
    `minSelect` INTEGER NOT NULL DEFAULT 0,
    `maxSelect` INTEGER NOT NULL DEFAULT 0,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `restaurant_modifier_groups_arName_key`(`arName`),
    UNIQUE INDEX `restaurant_modifier_groups_enName_key`(`enName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `restaurant_modifiers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `groupId` INTEGER NOT NULL,
    `arName` VARCHAR(100) NOT NULL,
    `enName` VARCHAR(100) NOT NULL,
    `price` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `restaurant_modifiers_groupId_arName_key`(`groupId`, `arName`),
    UNIQUE INDEX `restaurant_modifiers_groupId_enName_key`(`groupId`, `enName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `restaurant_modifiers` ADD CONSTRAINT `restaurant_modifiers_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `restaurant_modifier_groups`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- المجموعة مربوطة بأصنافها (طريقة الطهي للأسماك، الصوصات للشاورما...)
CREATE TABLE `restaurant_item_groups` (
    `productId` INTEGER NOT NULL,
    `groupId` INTEGER NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `restaurant_item_groups_groupId_idx`(`groupId`),
    PRIMARY KEY (`productId`, `groupId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `restaurant_item_groups` ADD CONSTRAINT `restaurant_item_groups_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `restaurant_items`(`productId`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `restaurant_item_groups` ADD CONSTRAINT `restaurant_item_groups_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `restaurant_modifier_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- التطبيقات (من لوحة التحكم): templateKey = "C<رقم التطبيق في اللوحة>"
-- الزيادة على سعر الصنف: markupType percent نسبة | amount مبلغ، markupValue قيمتها
-- commissionPercent: عمولة التطبيق من صافي المبيعات (التقارير)
-- الشركة مبتعدلش التطبيق، بتكتب أسعار الأصناف فيه بس
CREATE TABLE `sales_channels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `templateKey` VARCHAR(20) NOT NULL,
    `arName` VARCHAR(100) NOT NULL,
    `enName` VARCHAR(100) NOT NULL,
    `markupType` VARCHAR(10) NOT NULL DEFAULT 'percent',
    `markupValue` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `commissionPercent` DECIMAL(7, 2) NOT NULL DEFAULT 0,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sales_channels_templateKey_key`(`templateKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- سعر خاص للصنف في التطبيق (sizeId = 0: الصنف من غير حجم)
-- مش موجود = سعر الصنف + زيادة التطبيق
CREATE TABLE `restaurant_channel_prices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `channelId` INTEGER NOT NULL,
    `sizeId` INTEGER NOT NULL DEFAULT 0,
    `price` DECIMAL(18, 4) NOT NULL DEFAULT 0,

    UNIQUE INDEX `restaurant_channel_prices_productId_channelId_sizeId_key`(`productId`, `channelId`, `sizeId`),
    INDEX `restaurant_channel_prices_channelId_idx`(`channelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `restaurant_channel_prices` ADD CONSTRAINT `restaurant_channel_prices_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `restaurant_items`(`productId`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `restaurant_channel_prices` ADD CONSTRAINT `restaurant_channel_prices_channelId_fkey` FOREIGN KEY (`channelId`) REFERENCES `sales_channels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- السائقين (التوصيل): commissionType percent نسبة من رسوم التوصيل | amount مبلغ على كل طلب
CREATE TABLE `restaurant_drivers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(30) NULL,
    `commissionType` VARCHAR(10) NOT NULL DEFAULT 'amount',
    `commissionValue` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `restaurant_drivers_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- الإعدادات (0 = مقفولة):
-- رسوم الخدمة: النسبة الافتراضية (بتتغير في الفاتورة) + على الطلب المحلي بس ولا كله
-- رسوم التوصيل: المبلغ الافتراضي، رسوم التبغ: النسبة على صافي أصناف التبغ
-- *ProductId: صنف الخدمة اللي بيتسجل بيه السطر (بيتعمل لوحده من شاشة الإعدادات)
ALTER TABLE `system_settings`
    ADD COLUMN `restaurantServicePercent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `restaurantServiceDineInOnly` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `restaurantDeliveryFee` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    ADD COLUMN `restaurantTobaccoPercent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `restaurantServiceProductId` INTEGER NULL,
    ADD COLUMN `restaurantDeliveryProductId` INTEGER NULL,
    ADD COLUMN `restaurantTobaccoProductId` INTEGER NULL;

-- بيانات البداية (بتتعدّل من الشاشة)
INSERT IGNORE INTO `restaurant_sizes` (`arName`, `enName`, `sortOrder`) VALUES
    ('صغير', 'Small', 1),
    ('وسط', 'Medium', 2),
    ('كبير', 'Large', 3);
