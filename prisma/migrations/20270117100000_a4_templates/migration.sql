-- ------------------------------------------------------------
-- نماذج طباعة A4: الحالي / ثنائي اللغة / ورق مطبوع جاهز (هيدر وفوتر)
-- + عنوان الشركة بالإنجليزي (للنموذج ثنائي اللغة)
-- ------------------------------------------------------------
ALTER TABLE `invoice_print_settings`
    ADD COLUMN `a4Template` VARCHAR(12) NOT NULL DEFAULT 'classic',
    ADD COLUMN `letterTop` INTEGER NOT NULL DEFAULT 45,
    ADD COLUMN `letterBottom` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `letterImage` VARCHAR(255) NULL;

ALTER TABLE `company`
    ADD COLUMN `enCity` VARCHAR(100) NULL,
    ADD COLUMN `enDistrict` VARCHAR(100) NULL,
    ADD COLUMN `enStreet` VARCHAR(100) NULL;
