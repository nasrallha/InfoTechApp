-- أمان الدخول: إعدادات الدخول والجلسات + سجل محاولات الدخول + القفل المؤقت
-- + آخر نشاط وعنوان الجهاز في الجلسات
-- (إضافة جداول وأعمدة فقط - بدون مسح أي بيانات)

ALTER TABLE `sessions`
  ADD COLUMN `ip` VARCHAR(45) NULL,
  ADD COLUMN `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

CREATE TABLE `security_settings` (
    `id` INTEGER NOT NULL,
    `maxAttempts` INTEGER NOT NULL DEFAULT 5,
    `attemptWindowMinutes` INTEGER NOT NULL DEFAULT 15,
    `lockMinutes` INTEGER NOT NULL DEFAULT 10,
    `progressiveLock` BOOLEAN NOT NULL DEFAULT true,
    `showRemaining` BOOLEAN NOT NULL DEFAULT true,
    `ipMaxAttempts` INTEGER NOT NULL DEFAULT 0,
    `idleMinutes` INTEGER NOT NULL DEFAULT 0,
    `sessionHours` INTEGER NOT NULL DEFAULT 168,
    `logoutOnBrowserClose` BOOLEAN NOT NULL DEFAULT false,
    `maxDevices` INTEGER NOT NULL DEFAULT 0,
    `deviceLimitMode` VARCHAR(10) NOT NULL DEFAULT 'oldest',
    `deviceLimitSkipSuper` BOOLEAN NOT NULL DEFAULT true,
    `logRetentionDays` INTEGER NOT NULL DEFAULT 90,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `login_attempts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `userId` INTEGER NULL,
    `success` BOOLEAN NOT NULL,
    `reason` VARCHAR(20) NOT NULL,
    `ip` VARCHAR(45) NULL,
    `userAgent` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `login_attempts_createdAt_idx`(`createdAt`),
    INDEX `login_attempts_username_createdAt_idx`(`username`, `createdAt`),
    INDEX `login_attempts_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `login_locks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kind` VARCHAR(4) NOT NULL,
    `key` VARCHAR(64) NOT NULL,
    `failures` INTEGER NOT NULL DEFAULT 0,
    `windowStart` DATETIME(3) NOT NULL,
    `lastFailAt` DATETIME(3) NOT NULL,
    `lockedUntil` DATETIME(3) NULL,
    `lockCount` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `login_locks_kind_key_key`(`kind`, `key`),
    INDEX `login_locks_lockedUntil_idx`(`lockedUntil`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `login_attempts` ADD CONSTRAINT `login_attempts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
