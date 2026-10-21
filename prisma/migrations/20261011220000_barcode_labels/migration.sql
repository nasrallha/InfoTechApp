-- قوالب ملصقات الباركود (جدول جديد + 5 قوالب جاهزة، بدون مسح أي بيانات)

-- CreateTable
CREATE TABLE `barcode_labels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `arName` VARCHAR(100) NOT NULL,
    `enName` VARCHAR(100) NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `barcodeFormat` VARCHAR(20) NOT NULL DEFAULT 'CODE128',
    `barcodeSize` VARCHAR(10) NOT NULL DEFAULT 'normal',
    `showName` BOOLEAN NOT NULL DEFAULT true,
    `showPrice` BOOLEAN NOT NULL DEFAULT true,
    `priceWithTax` BOOLEAN NOT NULL DEFAULT true,
    `showCode` BOOLEAN NOT NULL DEFAULT true,
    `showCompany` BOOLEAN NOT NULL DEFAULT false,
    `nameFontSize` INTEGER NOT NULL DEFAULT 8,
    `priceFontSize` INTEGER NOT NULL DEFAULT 10,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `barcode_labels_arName_key`(`arName`),
    UNIQUE INDEX `barcode_labels_enName_key`(`enName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- القوالب الجاهزة (المقاسات بالمللي) - 50×25 هو الافتراضي
INSERT INTO `barcode_labels`
    (`arName`, `enName`, `width`, `height`, `showCompany`, `nameFontSize`, `priceFontSize`, `isDefault`, `updatedAt`)
VALUES
    ('ملصق كبير 100×150', 'Large label 100×150', 100, 150, true, 16, 22, false, CURRENT_TIMESTAMP(3)),
    ('ملصق 60×40', 'Label 60×40', 60, 40, true, 9, 12, false, CURRENT_TIMESTAMP(3)),
    ('ملصق 50×25', 'Label 50×25', 50, 25, false, 7, 9, true, CURRENT_TIMESTAMP(3)),
    ('ملصق 40×22', 'Label 40×22', 40, 22, false, 6, 8, false, CURRENT_TIMESTAMP(3)),
    ('ملصق 38×28', 'Label 38×28', 38, 28, false, 6, 8, false, CURRENT_TIMESTAMP(3));
