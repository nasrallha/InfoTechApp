-- ------------------------------------------------------------
-- بداية يوم العمل (الإعدادات العامة): 0 = منتصف الليل (اليوم العادي)
-- ------------------------------------------------------------
ALTER TABLE `system_settings` ADD COLUMN `dayStartHour` INTEGER NOT NULL DEFAULT 0;

-- ------------------------------------------------------------
-- ترتيب الوردية في يوم العمل لكل فرع (الوردية 1 / 2 / 3 ...)
-- businessDay: يوم العمل اللي اتفتحت فيه الوردية
-- ------------------------------------------------------------
ALTER TABLE `shifts` ADD COLUMN `businessDay` DATE NULL,
    ADD COLUMN `dayNo` INTEGER NULL;

-- الورديات القديمة: اليوم بتوقيت السعودية (openedAt متخزن UTC) ← بداية اليوم منتصف الليل
UPDATE `shifts` SET `businessDay` = DATE(DATE_ADD(`openedAt`, INTERVAL 3 HOUR));

-- الترتيب حسب وقت الفتح في نفس الفرع ونفس اليوم
UPDATE `shifts` AS s
    INNER JOIN (
        SELECT `id`,
            ROW_NUMBER() OVER (
                PARTITION BY `branchId`, `businessDay`
                ORDER BY `openedAt`, `id`
            ) AS rn
        FROM `shifts`
    ) AS x ON x.`id` = s.`id`
SET s.`dayNo` = x.rn;

ALTER TABLE `shifts` MODIFY `businessDay` DATE NOT NULL,
    MODIFY `dayNo` INTEGER NOT NULL;

CREATE UNIQUE INDEX `shifts_branchId_businessDay_dayNo_key` ON `shifts`(`branchId`, `businessDay`, `dayNo`);
CREATE INDEX `shifts_businessDay_idx` ON `shifts`(`businessDay`);
