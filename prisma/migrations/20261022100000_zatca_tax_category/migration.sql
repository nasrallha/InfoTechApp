-- الفوترة الإلكترونية: فئة الضريبة وسبب الإعفاء للصنف ولسطر فاتورة البيع
-- إضافة أعمدة فقط (بدون مسح أي بيانات)

ALTER TABLE `products`
    ADD COLUMN `taxCategory` VARCHAR(1) NOT NULL DEFAULT 'S',
    ADD COLUMN `taxExemptionCode` VARCHAR(20) NULL,
    ADD COLUMN `taxExemptionReason` VARCHAR(255) NULL;

ALTER TABLE `sale_items`
    ADD COLUMN `taxCategory` VARCHAR(1) NOT NULL DEFAULT 'S',
    ADD COLUMN `taxExemptionCode` VARCHAR(20) NULL,
    ADD COLUMN `taxExemptionReason` VARCHAR(255) NULL;

-- الأصناف الحالية بنسبة صفر: خارج نطاق الضريبة (تقدر تغيّرها من شاشة الصنف)
UPDATE `products`
SET `taxCategory` = 'O',
    `taxExemptionCode` = 'VATEX-SA-OOS',
    `taxExemptionReason` = 'Not subject to VAT | خارج نطاق الضريبة'
WHERE `taxRate` = 0;

UPDATE `sale_items`
SET `taxCategory` = 'O',
    `taxExemptionCode` = 'VATEX-SA-OOS',
    `taxExemptionReason` = 'Not subject to VAT | خارج نطاق الضريبة'
WHERE `taxRate` = 0;
