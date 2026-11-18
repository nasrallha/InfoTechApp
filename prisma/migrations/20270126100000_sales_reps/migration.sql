-- المناديب والعمولات (وحدة salesReps)
-- نسبة عمولة المندوب + مندوب الفاتورة وعرض السعر + صلاحية «مندوب مبيعات» لدور المندوب

ALTER TABLE `users` ADD COLUMN `commissionRate` DECIMAL(5, 2) NOT NULL DEFAULT 0;

ALTER TABLE `sales` ADD COLUMN `salesRepId` INTEGER NULL;
CREATE INDEX `sales_salesRepId_idx` ON `sales`(`salesRepId`);
ALTER TABLE `sales`
    ADD CONSTRAINT `sales_salesRepId_fkey` FOREIGN KEY (`salesRepId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `quotations` ADD COLUMN `salesRepId` INTEGER NULL;
CREATE INDEX `quotations_salesRepId_idx` ON `quotations`(`salesRepId`);
ALTER TABLE `quotations`
    ADD CONSTRAINT `quotations_salesRepId_fkey` FOREIGN KEY (`salesRepId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- دور «مندوب» (من قوالب اللوحة) ← صلاحية مندوب مبيعات
INSERT IGNORE INTO `role_permissions` (`roleId`, `permission`)
SELECT `id`, 'salesReps.rep' FROM `roles`
 WHERE `isOwner` = 0 AND (`arName` = 'مندوب' OR `enName` IN ('delegate', 'Delegate', 'Sales rep', 'Sales representative'));
