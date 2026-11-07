-- ------------------------------------------------------------
-- الأرقام التسلسلية في التوالف والزيادات
-- ------------------------------------------------------------
ALTER TABLE `product_serials` ADD COLUMN `surplusItemId` INTEGER NULL,
    ADD COLUMN `damageItemId` INTEGER NULL;

CREATE INDEX `product_serials_surplusItemId_idx` ON `product_serials`(`surplusItemId`);
CREATE INDEX `product_serials_damageItemId_idx` ON `product_serials`(`damageItemId`);

ALTER TABLE `product_serials` ADD CONSTRAINT `product_serials_surplusItemId_fkey` FOREIGN KEY (`surplusItemId`) REFERENCES `stock_adjustment_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `product_serials` ADD CONSTRAINT `product_serials_damageItemId_fkey` FOREIGN KEY (`damageItemId`) REFERENCES `stock_adjustment_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- إعداد: تكرار نفس الصنف في أكتر من سطر في الفاتورة
-- ------------------------------------------------------------
ALTER TABLE `system_settings` ADD COLUMN `allowDuplicateLines` BOOLEAN NOT NULL DEFAULT false;
