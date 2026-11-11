-- ------------------------------------------------------------
-- ترقيم الفروع - المرحلة التانية: كل مستند ترقيمه لكل فرع ورمز الفرع قبله
-- الورديات / الحجوزات / طلبات الصيانة / العقود / اشتراكات المغسلة / التحويلات / التوالف / الجرد
-- - التحويلات والتوالف والجرد مكانش ليها فرع: بقى ليها branchId
--   (القديم: فرع المستودع، وإلا فرع المستخدم اللي عمله، وإلا أول فرع)
-- - docCode = رمز الفرع وقت الترقيم (القديم فاضي ويفضل برقمه زي ما هو)
-- - الرقم بقى فريد جوه الفرع (بدل الشركة كلها) - البيانات القديمة متتغيرش
-- ------------------------------------------------------------

-- ---------- التحويلات (فرع المستودع اللي خارج منه) ----------
ALTER TABLE `stock_transfers`
    ADD COLUMN `branchId` INTEGER NULL,
    ADD COLUMN `docCode` VARCHAR(10) NULL;
UPDATE `stock_transfers` t SET t.`branchId` = COALESCE(
    (SELECT MIN(b.`id`) FROM `branches` b WHERE b.`warehouseId` = t.`fromWarehouseId`),
    (SELECT u.`branchId` FROM `users` u WHERE u.`id` = t.`createdById`),
    (SELECT MIN(b2.`id`) FROM `branches` b2));
ALTER TABLE `stock_transfers`
    MODIFY `branchId` INTEGER NOT NULL,
    ADD INDEX `stock_transfers_branchId_idx`(`branchId`),
    ADD UNIQUE INDEX `stock_transfers_branchId_number_key`(`branchId`, `number`),
    DROP INDEX `stock_transfers_number_key`,
    ADD CONSTRAINT `stock_transfers_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------- التوالف والزيادات (فرع المستودع) ----------
ALTER TABLE `stock_adjustments`
    ADD COLUMN `branchId` INTEGER NULL,
    ADD COLUMN `docCode` VARCHAR(10) NULL;
UPDATE `stock_adjustments` t SET t.`branchId` = COALESCE(
    (SELECT MIN(b.`id`) FROM `branches` b WHERE b.`warehouseId` = t.`warehouseId`),
    (SELECT u.`branchId` FROM `users` u WHERE u.`id` = t.`createdById`),
    (SELECT MIN(b2.`id`) FROM `branches` b2));
ALTER TABLE `stock_adjustments`
    MODIFY `branchId` INTEGER NOT NULL,
    ADD INDEX `stock_adjustments_branchId_idx`(`branchId`),
    ADD UNIQUE INDEX `stock_adjustments_branchId_number_key`(`branchId`, `number`),
    DROP INDEX `stock_adjustments_number_key`,
    ADD CONSTRAINT `stock_adjustments_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------- الجرد (فرع المستودع) ----------
ALTER TABLE `inventory_counts`
    ADD COLUMN `branchId` INTEGER NULL,
    ADD COLUMN `docCode` VARCHAR(10) NULL;
UPDATE `inventory_counts` t SET t.`branchId` = COALESCE(
    (SELECT MIN(b.`id`) FROM `branches` b WHERE b.`warehouseId` = t.`warehouseId`),
    (SELECT u.`branchId` FROM `users` u WHERE u.`id` = t.`createdById`),
    (SELECT MIN(b2.`id`) FROM `branches` b2));
ALTER TABLE `inventory_counts`
    MODIFY `branchId` INTEGER NOT NULL,
    ADD INDEX `inventory_counts_branchId_idx`(`branchId`),
    ADD UNIQUE INDEX `inventory_counts_branchId_number_key`(`branchId`, `number`),
    DROP INDEX `inventory_counts_number_key`,
    ADD CONSTRAINT `inventory_counts_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------- اللي ليها فرع أصلاً ----------
ALTER TABLE `shifts`
    ADD COLUMN `docCode` VARCHAR(10) NULL,
    ADD UNIQUE INDEX `shifts_branchId_number_key`(`branchId`, `number`),
    DROP INDEX `shifts_number_key`;

ALTER TABLE `bookings`
    ADD COLUMN `docCode` VARCHAR(10) NULL,
    ADD UNIQUE INDEX `bookings_branchId_number_key`(`branchId`, `number`),
    DROP INDEX `bookings_number_key`;

ALTER TABLE `warranty_claims`
    ADD COLUMN `docCode` VARCHAR(10) NULL,
    ADD UNIQUE INDEX `warranty_claims_branchId_number_key`(`branchId`, `number`),
    DROP INDEX `warranty_claims_number_key`;

ALTER TABLE `maintenance_contracts`
    ADD COLUMN `docCode` VARCHAR(10) NULL,
    ADD UNIQUE INDEX `maintenance_contracts_branchId_number_key`(`branchId`, `number`),
    DROP INDEX `maintenance_contracts_number_key`;

ALTER TABLE `laundry_wallets`
    ADD COLUMN `docCode` VARCHAR(10) NULL,
    ADD UNIQUE INDEX `laundry_wallets_branchId_number_key`(`branchId`, `number`),
    DROP INDEX `laundry_wallets_number_key`;
