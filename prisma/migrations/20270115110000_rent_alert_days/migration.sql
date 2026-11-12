-- ------------------------------------------------------------
-- تأجير العقارات: أيام التنبيه (الإعدادات العامة - المالك)
-- قبل ميعاد الدفعة اللي لسه متفوترتش / قبل نهاية العقد
-- ------------------------------------------------------------
ALTER TABLE `system_settings`
    ADD COLUMN `rentDueAlertDays` INTEGER NOT NULL DEFAULT 7,
    ADD COLUMN `rentEndAlertDays` INTEGER NOT NULL DEFAULT 30;
