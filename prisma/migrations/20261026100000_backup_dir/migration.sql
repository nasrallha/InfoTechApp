-- النسخ الاحتياطي: مجلد حفظ النسخ (إضافة عمود فقط بدون مسح أي بيانات)
ALTER TABLE `system_settings` ADD COLUMN `backupDir` VARCHAR(500) NULL;
