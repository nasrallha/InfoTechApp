-- ------------------------------------------------------------
-- أسباب الإشعارات (قائمة يديرها المستخدم، مشتركة بين العملاء والموردين)
-- forCredit / forDebit: السبب يظهر في الإشعار الدائن / المدين
-- السبب الجديد المكتوب في إشعار بيتضاف هنا لوحده
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `note_reasons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `label` VARCHAR(500) NOT NULL,
    `forCredit` BOOLEAN NOT NULL DEFAULT true,
    `forDebit` BOOLEAN NOT NULL DEFAULT true,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `note_reasons_label_key`(`label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- أسباب مبدئية (تتعدل أو تتحذف من الشاشة)
INSERT IGNORE INTO `note_reasons` (`label`, `forCredit`, `forDebit`) VALUES
    ('خصم لاحق على الفاتورة', true, false),
    ('تصحيح مبلغ كُتب بالزيادة', true, false),
    ('إلغاء رسوم', true, false),
    ('تعويض عن تلف أو تأخير', true, false),
    ('تصحيح مبلغ كُتب بالنقص', false, true),
    ('رسوم إضافية بعد الفاتورة', false, true),
    ('غرامة تأخير سداد', false, true);
