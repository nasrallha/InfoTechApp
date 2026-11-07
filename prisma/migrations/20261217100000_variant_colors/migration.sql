-- ألوان المقاسات كدواير (وحدة variants)
-- products.colorHex: لون الدايرة، و variant_colors: الألوان اللي التاجر ضافها بنفسه
ALTER TABLE `products` ADD COLUMN `colorHex` VARCHAR(9) NULL;

CREATE TABLE `variant_colors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `arName` VARCHAR(30) NOT NULL,
    `hex` VARCHAR(9) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `variant_colors_arName_key`(`arName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- المقاسات القديمة: اللون المعروف بالاسم بياخد دايرته
UPDATE `products` SET `colorHex` = CASE `color`
    WHEN 'أسود' THEN '#111827' WHEN 'أبيض' THEN '#ffffff' WHEN 'رمادي' THEN '#9ca3af'
    WHEN 'كحلي' THEN '#1e3a8a' WHEN 'أزرق' THEN '#2563eb' WHEN 'سماوي' THEN '#7dd3fc'
    WHEN 'أحمر' THEN '#dc2626' WHEN 'نبيتي' THEN '#7f1d1d' WHEN 'وردي' THEN '#f9a8d4'
    WHEN 'بنفسجي' THEN '#7c3aed' WHEN 'أخضر' THEN '#16a34a' WHEN 'زيتي' THEN '#4d5d23'
    WHEN 'أصفر' THEN '#facc15' WHEN 'برتقالي' THEN '#f97316' WHEN 'بيج' THEN '#e7d8b9'
    WHEN 'بني' THEN '#7c4a21' WHEN 'ذهبي' THEN '#d4a017' WHEN 'فضي' THEN '#c0c4cc'
    ELSE NULL END
WHERE `color` IS NOT NULL;
