-- النسخ الاحتياطي التلقائي (مواعيد + عدد النسخ + آخر نتيجة)
-- (إضافة أعمدة فقط - بدون مسح أي بيانات)

ALTER TABLE `system_settings`
  ADD COLUMN `backupAutoEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `backupFrequency` VARCHAR(8) NOT NULL DEFAULT 'daily',
  ADD COLUMN `backupEveryHours` INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN `backupTime` VARCHAR(5) NOT NULL DEFAULT '03:00',
  ADD COLUMN `backupWeekday` INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN `backupKeep` INTEGER NOT NULL DEFAULT 14,
  ADD COLUMN `backupAutoSince` DATETIME(3) NULL,
  ADD COLUMN `lastAutoBackupAt` DATETIME(3) NULL,
  ADD COLUMN `lastAutoBackupOk` BOOLEAN NULL,
  ADD COLUMN `lastAutoBackupError` VARCHAR(500) NULL,
  ADD COLUMN `lastAutoBackupFile` VARCHAR(200) NULL;
