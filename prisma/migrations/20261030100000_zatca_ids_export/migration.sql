-- الربط مع الزكاة: معرّف العميل (لو مالوش رقم ضريبي) + الدولة + معرّف البائع + فاتورة التصدير
-- إضافة أعمدة وتوسيع مقاسات العنوان فقط (بدون مسح أي بيانات)

ALTER TABLE `customers`
  ADD COLUMN `idScheme` VARCHAR(5) NULL,
  ADD COLUMN `idNumber` VARCHAR(30) NULL,
  ADD COLUMN `countryCode` VARCHAR(2) NOT NULL DEFAULT 'SA',
  MODIFY `buildingNo` VARCHAR(10) NULL,
  MODIFY `additionalNo` VARCHAR(10) NULL,
  MODIFY `postalCode` VARCHAR(10) NULL;

ALTER TABLE `company`
  ADD COLUMN `sellerIdScheme` VARCHAR(5) NOT NULL DEFAULT 'CRN',
  ADD COLUMN `sellerIdNumber` VARCHAR(30) NULL;

ALTER TABLE `sales`
  ADD COLUMN `isExport` BOOLEAN NOT NULL DEFAULT false;
