-- ------------------------------------------------------------
-- معرّف الفرع في الفاتورة: نوعه (سجل تجاري / رقم موحد / ...) زي بيانات الشركة
-- - branches.idScheme: النوع (فاضي = سجل تجاري CRN زي ما كان)
-- - branches.registrationNo: الرقم (أطول عشان الأنواع التانية)
-- ------------------------------------------------------------
ALTER TABLE `branches`
    ADD COLUMN `idScheme` VARCHAR(3) NULL,
    MODIFY `registrationNo` VARCHAR(30) NULL;
