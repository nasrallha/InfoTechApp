-- اللغة الافتراضية للبرنامج (الإعدادات العامة)
-- (إضافة أعمدة فقط - بدون مسح أي بيانات)

ALTER TABLE `system_settings`
  ADD COLUMN `defaultLocale` VARCHAR(2) NOT NULL DEFAULT 'en',
  ADD COLUMN `localeDetection` BOOLEAN NOT NULL DEFAULT true;
