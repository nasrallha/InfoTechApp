-- الاشتراك: نسخة من لوحة التحكم (اللوحة بتكتب، والبرنامج بيقرا)

-- CreateTable
CREATE TABLE `subscription` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `companyCode` VARCHAR(16) NOT NULL,
    `companySerial` INTEGER NULL,
    `status` VARCHAR(20) NOT NULL,
    `suspendReason` VARCHAR(255) NULL,
    `planArName` VARCHAR(80) NULL,
    `planEnName` VARCHAR(80) NULL,
    `features` JSON NULL,
    `maxUsers` INTEGER NULL,
    `maxBranches` INTEGER NULL,
    `maxInvoicesMonth` INTEGER NULL,
    `startsAt` DATE NOT NULL,
    `endsAt` DATE NOT NULL,
    `graceDays` INTEGER NOT NULL DEFAULT 7,
    `readonlyDays` INTEGER NOT NULL DEFAULT 14,
    `expiringDays` INTEGER NOT NULL DEFAULT 7,
    `syncedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscription_log` (
    `id` INTEGER NOT NULL,
    `action` VARCHAR(20) NOT NULL,
    `planArName` VARCHAR(80) NULL,
    `planEnName` VARCHAR(80) NULL,
    `startsAt` DATE NULL,
    `endsAt` DATE NULL,
    `amount` DECIMAL(12, 2) NULL,
    `note` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
