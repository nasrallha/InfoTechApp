-- ------------------------------------------------------------
-- سبب الإشعار بالعربي والإنجليزي
-- - note_reasons.enLabel: الاسم الإنجليزي للسبب في القائمة
-- - sales / purchases.noteReasonEn: السبب بالإنجليزي في الإشعار (للطباعة)
--   (الـ XML بياخد السبب العربي noteReason)
-- ------------------------------------------------------------
ALTER TABLE `note_reasons`
    ADD COLUMN `enLabel` VARCHAR(500) NULL;

ALTER TABLE `sales`
    ADD COLUMN `noteReasonEn` VARCHAR(500) NULL;

ALTER TABLE `purchases`
    ADD COLUMN `noteReasonEn` VARCHAR(500) NULL;

-- ترجمة الأسباب المبدئية
UPDATE `note_reasons` SET `enLabel` = 'Later discount on the invoice' WHERE `label` = 'خصم لاحق على الفاتورة' AND `enLabel` IS NULL;
UPDATE `note_reasons` SET `enLabel` = 'Correction of an overcharged amount' WHERE `label` = 'تصحيح مبلغ كُتب بالزيادة' AND `enLabel` IS NULL;
UPDATE `note_reasons` SET `enLabel` = 'Fees cancelled' WHERE `label` = 'إلغاء رسوم' AND `enLabel` IS NULL;
UPDATE `note_reasons` SET `enLabel` = 'Compensation for damage or delay' WHERE `label` = 'تعويض عن تلف أو تأخير' AND `enLabel` IS NULL;
UPDATE `note_reasons` SET `enLabel` = 'Correction of an undercharged amount' WHERE `label` = 'تصحيح مبلغ كُتب بالنقص' AND `enLabel` IS NULL;
UPDATE `note_reasons` SET `enLabel` = 'Additional fees after the invoice' WHERE `label` = 'رسوم إضافية بعد الفاتورة' AND `enLabel` IS NULL;
UPDATE `note_reasons` SET `enLabel` = 'Late payment penalty' WHERE `label` = 'غرامة تأخير سداد' AND `enLabel` IS NULL;
