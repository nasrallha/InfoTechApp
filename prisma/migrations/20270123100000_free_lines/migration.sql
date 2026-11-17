-- البند الحر في فواتير البيع والشراء (إعداد المالك): NULL = حسب النشاط
ALTER TABLE `system_settings` ADD COLUMN `freeLines` BOOLEAN NULL;
