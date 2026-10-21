-- العملاء: السجل التجاري بقى جزء من "معرّف العميل" (النوع CRN)
-- 1) ننقل السجل الموجود للمعرّف (لو العميل مالوش معرّف)
UPDATE `customers`
  SET `idScheme` = 'CRN', `idNumber` = `registrationNo`
  WHERE `registrationNo` IS NOT NULL AND `registrationNo` <> ''
    AND (`idScheme` IS NULL OR `idNumber` IS NULL OR `idNumber` = '');

-- 2) خانة السجل القديمة للعملاء مبقتش مستخدمة
UPDATE `customers` SET `registrationNo` = NULL;

-- 3) نفس المعرّف (النوع + الرقم) ما يتكررش لعميلين
CREATE UNIQUE INDEX `customers_idScheme_idNumber_key` ON `customers`(`idScheme`, `idNumber`);
