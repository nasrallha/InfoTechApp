-- جوال وإيميل الشركة + إعدادات طباعة الفواتير (إضافة فقط، بدون مسح أي بيانات)

-- AlterTable
ALTER TABLE `company` ADD COLUMN `email` VARCHAR(100) NULL,
    ADD COLUMN `phone` VARCHAR(20) NULL;

-- CreateTable
CREATE TABLE `invoice_print_settings` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `paperSize` VARCHAR(10) NOT NULL DEFAULT '80mm',
    `marginTop` INTEGER NOT NULL DEFAULT 2,
    `marginBottom` INTEGER NOT NULL DEFAULT 2,
    `marginRight` INTEGER NOT NULL DEFAULT 2,
    `marginLeft` INTEGER NOT NULL DEFAULT 2,
    `fontSize` VARCHAR(10) NOT NULL DEFAULT 'normal',
    `language` VARCHAR(5) NOT NULL DEFAULT 'both',
    `showLogo` BOOLEAN NOT NULL DEFAULT true,
    `logoSize` VARCHAR(10) NOT NULL DEFAULT 'medium',
    `showCashier` BOOLEAN NOT NULL DEFAULT true,
    `showCustomer` BOOLEAN NOT NULL DEFAULT true,
    `showItemCode` BOOLEAN NOT NULL DEFAULT false,
    `showUnit` BOOLEAN NOT NULL DEFAULT true,
    `showDiscount` BOOLEAN NOT NULL DEFAULT true,
    `showItemTax` BOOLEAN NOT NULL DEFAULT false,
    `footerTextAr` VARCHAR(500) NULL,
    `footerTextEn` VARCHAR(500) NULL,
    `autoPrint` BOOLEAN NOT NULL DEFAULT false,
    `copies` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
