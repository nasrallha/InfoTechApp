-- الإعدادات العامة: نسبة الضريبة في البرنامج + وضع سعر الصنف الافتراضي
-- إضافة أعمدة فقط، بدون مسح أي بيانات

-- AlterTable
ALTER TABLE `system_settings` ADD COLUMN `taxRate` DECIMAL(5, 2) NOT NULL DEFAULT 15,
    ADD COLUMN `productPriceIncludesTax` BOOLEAN NOT NULL DEFAULT false;
