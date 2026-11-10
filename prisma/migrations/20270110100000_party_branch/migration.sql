-- ------------------------------------------------------------
-- العملاء والموردين حسب الفروع (زي إتاحة الأصناف في المستودعات)
-- allBranches: true = متاح في كل الفروع / false = الفروع المسجّلة في الجدول بس
-- (البيانات الحالية بتفضل "كل الفروع" عشان محدش يختفي)
-- ------------------------------------------------------------
ALTER TABLE `customers`
    ADD COLUMN `allBranches` BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE `suppliers`
    ADD COLUMN `allBranches` BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS `customer_branches` (
    `customerId` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,

    INDEX `customer_branches_branchId_idx`(`branchId`),
    PRIMARY KEY (`customerId`, `branchId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `customer_branches`
    ADD CONSTRAINT `customer_branches_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `customer_branches`
    ADD CONSTRAINT `customer_branches_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS `supplier_branches` (
    `supplierId` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,

    INDEX `supplier_branches_branchId_idx`(`branchId`),
    PRIMARY KEY (`supplierId`, `branchId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `supplier_branches`
    ADD CONSTRAINT `supplier_branches_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `supplier_branches`
    ADD CONSTRAINT `supplier_branches_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
