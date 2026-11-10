-- ------------------------------------------------------------
-- الإشعارات الدائنة والمدينة (للعملاء والموردين)
-- - بتتسجل في جداول المبيعات والمشتريات بنوع جديد: credit (دائن) / debit (مدين)
-- - السطر ممكن يكون صنف (تصحيح سعر) أو بند حر من غير صنف (خصم، رسوم شحن...)
--   ← الصنف والوحدة بقوا اختياريين، والبند في lineKind
-- - noteReason: سبب الإشعار (إلزامي للهيئة)
-- - billingRef: مرجع الفاتورة لو الإشعار مش مربوط بفاتورة في البرنامج
-- ------------------------------------------------------------
ALTER TABLE `sale_items`
    MODIFY `productId` INTEGER NULL,
    MODIFY `unitId` INTEGER NULL,
    ADD COLUMN `lineKind` VARCHAR(12) NULL;

ALTER TABLE `purchase_items`
    MODIFY `productId` INTEGER NULL,
    MODIFY `unitId` INTEGER NULL,
    ADD COLUMN `lineKind` VARCHAR(12) NULL;

ALTER TABLE `sales`
    ADD COLUMN `noteReason` VARCHAR(500) NULL,
    ADD COLUMN `billingRef` VARCHAR(100) NULL;

ALTER TABLE `purchases`
    ADD COLUMN `noteReason` VARCHAR(500) NULL,
    ADD COLUMN `billingRef` VARCHAR(100) NULL;
