-- المقاسات والألوان (وحدة variants: الملابس والأحذية)
-- الموديل = اسم مشترك، وكل مقاس (ولون اختياري) صنف عادي تحته بكود ورصيد مستقل
CREATE TABLE `product_models` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `arName` VARCHAR(150) NOT NULL,
    `enName` VARCHAR(150) NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `products`
    ADD COLUMN `modelId` INTEGER NULL,
    ADD COLUMN `size` VARCHAR(30) NULL,
    ADD COLUMN `color` VARCHAR(30) NULL;

CREATE INDEX `products_modelId_idx` ON `products`(`modelId`);

ALTER TABLE `products` ADD CONSTRAINT `products_modelId_fkey`
    FOREIGN KEY (`modelId`) REFERENCES `product_models`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- وحدة المتر (الأقمشة): بكسور (2.5 متر)
INSERT IGNORE INTO `units` (`arName`, `enName`, `isActive`, `allowDecimals`, `createdAt`, `updatedAt`) VALUES
  ('متر', 'Meter', true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
