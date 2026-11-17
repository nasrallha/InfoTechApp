-- السنة المالية + ترقيم المستندات لكل سنة مالية (DM-SI-2026-15)
-- docCode بقى «السنة + رمز الفرع» (2026DM) للمستندات الجديدة، والقديمة زي ما هي
-- الرقم مايتكررش لكل فرع (ونوع) وسنة: القيد الجديد بيتعمل الأول وبعدين القديم يتشال
-- (عشان مفتاح الفرع الأجنبي يفضل له index)

CREATE TABLE IF NOT EXISTS `fiscal_years` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `code` INTEGER NOT NULL,
  `startDate` DATE NOT NULL,
  `endDate` DATE NOT NULL,
  `status` VARCHAR(10) NOT NULL DEFAULT 'open',
  `closedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `fiscal_years_code_key`(`code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- بداية السنة المالية (الشهر): 1 = يناير
ALTER TABLE `system_settings` ADD COLUMN `fiscalStartMonth` INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX `purchases_branchId_type_docCode_number_key` ON `purchases`(`branchId`, `type`, `docCode`, `number`);
DROP INDEX `purchases_branchId_type_number_key` ON `purchases`;

CREATE UNIQUE INDEX `stock_transfers_branchId_docCode_number_key` ON `stock_transfers`(`branchId`, `docCode`, `number`);
DROP INDEX `stock_transfers_branchId_number_key` ON `stock_transfers`;

CREATE UNIQUE INDEX `stock_adjustments_branchId_docCode_number_key` ON `stock_adjustments`(`branchId`, `docCode`, `number`);
DROP INDEX `stock_adjustments_branchId_number_key` ON `stock_adjustments`;

CREATE UNIQUE INDEX `inventory_counts_branchId_docCode_number_key` ON `inventory_counts`(`branchId`, `docCode`, `number`);
DROP INDEX `inventory_counts_branchId_number_key` ON `inventory_counts`;

CREATE UNIQUE INDEX `sales_branchId_type_docCode_number_key` ON `sales`(`branchId`, `type`, `docCode`, `number`);
DROP INDEX `sales_branchId_type_number_key` ON `sales`;

CREATE UNIQUE INDEX `quotations_branchId_docCode_number_key` ON `quotations`(`branchId`, `docCode`, `number`);
DROP INDEX `quotations_branchId_number_key` ON `quotations`;

CREATE UNIQUE INDEX `shifts_branchId_docCode_number_key` ON `shifts`(`branchId`, `docCode`, `number`);
DROP INDEX `shifts_branchId_number_key` ON `shifts`;

CREATE UNIQUE INDEX `vouchers_branchId_type_docCode_number_key` ON `vouchers`(`branchId`, `type`, `docCode`, `number`);
DROP INDEX `vouchers_branchId_type_number_key` ON `vouchers`;

CREATE UNIQUE INDEX `warranty_claims_branchId_docCode_number_key` ON `warranty_claims`(`branchId`, `docCode`, `number`);
DROP INDEX `warranty_claims_branchId_number_key` ON `warranty_claims`;

CREATE UNIQUE INDEX `maintenance_contracts_branchId_docCode_number_key` ON `maintenance_contracts`(`branchId`, `docCode`, `number`);
DROP INDEX `maintenance_contracts_branchId_number_key` ON `maintenance_contracts`;

CREATE UNIQUE INDEX `bookings_branchId_docCode_number_key` ON `bookings`(`branchId`, `docCode`, `number`);
DROP INDEX `bookings_branchId_number_key` ON `bookings`;

CREATE UNIQUE INDEX `laundry_wallets_branchId_docCode_number_key` ON `laundry_wallets`(`branchId`, `docCode`, `number`);
DROP INDEX `laundry_wallets_branchId_number_key` ON `laundry_wallets`;

CREATE UNIQUE INDEX `rent_contracts_branchId_docCode_number_key` ON `rent_contracts`(`branchId`, `docCode`, `number`);
DROP INDEX `rent_contracts_branchId_number_key` ON `rent_contracts`;

CREATE UNIQUE INDEX `tailor_orders_branchId_docCode_number_key` ON `tailor_orders`(`branchId`, `docCode`, `number`);
DROP INDEX `tailor_orders_branchId_number_key` ON `tailor_orders`;

CREATE UNIQUE INDEX `construction_contracts_branchId_docCode_number_key` ON `construction_contracts`(`branchId`, `docCode`, `number`);
DROP INDEX `construction_contracts_branchId_number_key` ON `construction_contracts`;
