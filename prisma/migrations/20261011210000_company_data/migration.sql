-- بيانات الشركة (جدول جديد فقط، بدون مسح أي بيانات)

-- CreateTable
CREATE TABLE `company` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `arName` VARCHAR(255) NOT NULL,
    `enName` VARCHAR(255) NOT NULL,
    `taxNo` VARCHAR(15) NULL,
    `registrationNo` VARCHAR(10) NULL,
    `city` VARCHAR(100) NULL,
    `district` VARCHAR(100) NULL,
    `street` VARCHAR(100) NULL,
    `buildingNo` VARCHAR(4) NULL,
    `additionalNo` VARCHAR(4) NULL,
    `postalCode` VARCHAR(5) NULL,
    `logo` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
