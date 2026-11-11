-- ------------------------------------------------------------
-- ترقيم المستندات لكل فرع (رمز الفرع قبل الرقم: DM-SI-5)
-- - الفرع: رمز (فاضي = بيتعمل تلقائي) + قفل الرمز مع أول مستند مترقّم
-- - المبيعات / المشتريات / السندات / عروض الأسعار:
--     docCode = رمز الفرع وقت الترقيم (القديم فاضي ويفضل برقمه زي ما هو: SI-5)
--     الرقم بقى فريد جوه الفرع (بدل الشركة كلها)
-- - المسلسلات: لكل فرع (المفتاح "النوع@الفرع") وبتكمل بعد أكبر رقم في الفرع
-- البيانات القديمة متتغيرش (القيد الجديد أوسع من القديم)
-- ------------------------------------------------------------
ALTER TABLE `branches`
    ADD COLUMN `code` VARCHAR(10) NULL,
    ADD COLUMN `codeLocked` BOOLEAN NOT NULL DEFAULT false,
    ADD UNIQUE INDEX `branches_code_key`(`code`);

ALTER TABLE `sales`
    ADD COLUMN `docCode` VARCHAR(10) NULL,
    ADD UNIQUE INDEX `sales_branchId_type_number_key`(`branchId`, `type`, `number`),
    DROP INDEX `sales_type_number_key`;

ALTER TABLE `purchases`
    ADD COLUMN `docCode` VARCHAR(10) NULL,
    ADD UNIQUE INDEX `purchases_branchId_type_number_key`(`branchId`, `type`, `number`),
    DROP INDEX `purchases_type_number_key`;

ALTER TABLE `vouchers`
    ADD COLUMN `docCode` VARCHAR(10) NULL,
    ADD UNIQUE INDEX `vouchers_branchId_type_number_key`(`branchId`, `type`, `number`),
    DROP INDEX `vouchers_type_number_key`;

ALTER TABLE `quotations`
    ADD COLUMN `docCode` VARCHAR(10) NULL,
    ADD UNIQUE INDEX `quotations_branchId_number_key`(`branchId`, `number`),
    DROP INDEX `quotations_number_key`;
