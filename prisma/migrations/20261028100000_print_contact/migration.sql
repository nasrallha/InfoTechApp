-- إعدادات طباعة الفواتير: إظهار الجوال / البريد الإلكتروني (إضافة أعمدة فقط)
ALTER TABLE `invoice_print_settings`
  ADD COLUMN `showPhone` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `showEmail` BOOLEAN NOT NULL DEFAULT false;
