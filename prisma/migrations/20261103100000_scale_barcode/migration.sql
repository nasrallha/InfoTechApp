-- باركود الميزان + الرصيد الافتتاحي للصنف بكسور (الأصناف الموزونة)
-- (تعديل نوع عمود وإضافة أعمدة فقط - بدون مسح أي بيانات)

ALTER TABLE `products` MODIFY `startStock` DECIMAL(18, 3) NOT NULL DEFAULT 0;

ALTER TABLE `system_settings`
  ADD COLUMN `scaleEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `scaleFormat` VARCHAR(12) NOT NULL DEFAULT '1+6+5+1',
  ADD COLUMN `scaleFlag` VARCHAR(2) NOT NULL DEFAULT '1',
  ADD COLUMN `scaleValueType` VARCHAR(6) NOT NULL DEFAULT 'weight',
  ADD COLUMN `scaleWeightDecimals` INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN `scaleMoneyDecimals` INTEGER NOT NULL DEFAULT 2;
