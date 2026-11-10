-- ------------------------------------------------------------
-- بنود الإشعارات اللي بيضيفها المستخدم (غير البنود الثابتة في البرنامج)
-- مشتركة بين إشعارات العملاء والموردين
-- forCredit / forDebit: البند يظهر في الإشعار الدائن / المدين
-- السطر بيتسجل بـ lineKind = "c" + رقم البند
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `note_line_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `arName` VARCHAR(100) NOT NULL,
    `enName` VARCHAR(100) NOT NULL,
    `forCredit` BOOLEAN NOT NULL DEFAULT true,
    `forDebit` BOOLEAN NOT NULL DEFAULT true,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `note_line_items_arName_key`(`arName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
