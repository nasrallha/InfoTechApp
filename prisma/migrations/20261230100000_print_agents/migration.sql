-- ------------------------------------------------------------
-- وسيط الطباعة (برنامج صغير على جهاز ويندوز في المطعم)
-- - كود ربط لكل فرع (branches.printAgentKey): الوسيط بيتربط بيه مرة واحدة
-- - print_agents: الأجهزة المربوطة (آخر ظهور + طابعات ويندوز اللي عليها)
-- - print_jobs: مهام الطباعة اللي الوسيط بياخدها
--   kind: print طباعة صورة | test طباعة تجربة | probe اختبار اتصال IP | scan بحث عن الطابعات
--   status: queued مستنية | taken اتسحبت | done تمت | failed فشلت
-- - الطابعة: الأولوية + قص الورق + صوت التنبيه + (الكاشير) تذكرة كاملة مع الفاتورة
-- ------------------------------------------------------------
ALTER TABLE `branches`
    ADD COLUMN `printAgentKey` VARCHAR(20) NULL;
CREATE UNIQUE INDEX `branches_printAgentKey_key` ON `branches`(`printAgentKey`);

CREATE TABLE `print_agents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branchId` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `hostName` VARCHAR(100) NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `agentVersion` VARCHAR(20) NULL,
    `winPrinters` JSON NULL,
    `lastSeenAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `print_agents_tokenHash_key`(`tokenHash`),
    INDEX `print_agents_branchId_idx`(`branchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `print_agents` ADD CONSTRAINT `print_agents_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `print_jobs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branchId` INTEGER NOT NULL,
    `printerId` INTEGER NULL,
    `agentId` INTEGER NULL,
    `jobKind` VARCHAR(10) NOT NULL DEFAULT 'print',
    `title` VARCHAR(150) NULL,
    `connection` VARCHAR(10) NULL,
    `targetHost` VARCHAR(100) NULL,
    `targetPort` INTEGER NULL,
    `windowsName` VARCHAR(150) NULL,
    `paperSize` VARCHAR(10) NOT NULL DEFAULT '80mm',
    `copies` INTEGER NOT NULL DEFAULT 1,
    `autoCut` BOOLEAN NOT NULL DEFAULT true,
    `beep` BOOLEAN NOT NULL DEFAULT false,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `imageData` LONGTEXT NULL,
    `jobStatus` VARCHAR(10) NOT NULL DEFAULT 'queued',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `errorText` VARCHAR(500) NULL,
    `resultData` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `takenAt` DATETIME(3) NULL,
    `doneAt` DATETIME(3) NULL,

    INDEX `print_jobs_branchId_jobStatus_priority_idx`(`branchId`, `jobStatus`, `priority`),
    INDEX `print_jobs_printerId_idx`(`printerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `print_jobs` ADD CONSTRAINT `print_jobs_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `print_jobs` ADD CONSTRAINT `print_jobs_printerId_fkey` FOREIGN KEY (`printerId`) REFERENCES `restaurant_printers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `restaurant_printers`
    ADD COLUMN `priority` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `autoCut` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `beep` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `fullTicket` BOOLEAN NOT NULL DEFAULT false;
