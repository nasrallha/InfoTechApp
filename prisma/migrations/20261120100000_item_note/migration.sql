-- ملاحظة / وصف لكل سطر صنف في المبيعات وعروض الأسعار والمشتريات (والمرتجعات)
-- (إضافة أعمدة فقط - بدون مسح أي بيانات)

ALTER TABLE `sale_items` ADD COLUMN `note` VARCHAR(500) NULL;
ALTER TABLE `quotation_items` ADD COLUMN `note` VARCHAR(500) NULL;
ALTER TABLE `purchase_items` ADD COLUMN `note` VARCHAR(500) NULL;
