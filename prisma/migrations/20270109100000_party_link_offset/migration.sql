-- ------------------------------------------------------------
-- العميل اللي هو مورد كمان: ربط العميل بالمورد (كشف حساب مشترك + مقاصة)
-- سند المقاصة (type = offset): بيقلل رصيد العميل ورصيد المورد بنفس المبلغ
-- voucher_allocations.partySide: توزيع سند المقاصة على أنهي طرف
--   (customer / supplier، وفاضي في السندات العادية = طرف السند الوحيد)
-- ------------------------------------------------------------
ALTER TABLE `customers`
    ADD COLUMN `supplierId` INTEGER NULL;

CREATE UNIQUE INDEX `customers_supplierId_key` ON `customers`(`supplierId`);

ALTER TABLE `customers`
    ADD CONSTRAINT `customers_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `voucher_allocations`
    ADD COLUMN `partySide` VARCHAR(10) NULL;
