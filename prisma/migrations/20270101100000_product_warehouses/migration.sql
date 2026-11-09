-- ------------------------------------------------------------
-- الأصناف حسب المستودعات (الفروع)
-- - products.allWarehouses: الصنف متاح في كل المستودعات (الافتراضي، زي ما كان)
--   أو في المستودعات المسجلة في product_warehouses بس
-- - product_warehouses: الصنف متاح في المستودع + رصيده الافتتاحي فيه
-- الأصناف الموجودة: متاحة في كل المستودعات (مفيش حاجة بتختفي)
-- ------------------------------------------------------------
ALTER TABLE `products`
    ADD COLUMN `allWarehouses` BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE `product_warehouses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `warehouseId` INTEGER NOT NULL,
    `openingQty` DECIMAL(18, 3) NOT NULL DEFAULT 0,
    `openingUnitId` INTEGER NULL,

    UNIQUE INDEX `product_warehouses_productId_warehouseId_key`(`productId`, `warehouseId`),
    INDEX `product_warehouses_warehouseId_idx`(`warehouseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `product_warehouses` ADD CONSTRAINT `product_warehouses_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `product_warehouses` ADD CONSTRAINT `product_warehouses_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
