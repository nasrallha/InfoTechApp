-- العملات وطرق الدفع (جداول جديدة + بيانات جاهزة، بدون مسح أي بيانات)

-- CreateTable
CREATE TABLE `currencies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(3) NOT NULL,
    `arName` VARCHAR(50) NOT NULL,
    `enName` VARCHAR(50) NOT NULL,
    `arSymbol` VARCHAR(10) NOT NULL,
    `enSymbol` VARCHAR(10) NOT NULL,
    `decimals` INTEGER NOT NULL DEFAULT 2,
    `isBase` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `currencies_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_methods` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `arName` VARCHAR(50) NOT NULL,
    `enName` VARCHAR(50) NOT NULL,
    `type` VARCHAR(10) NOT NULL,
    `requiresReference` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payment_methods_arName_key`(`arName`),
    UNIQUE INDEX `payment_methods_enName_key`(`enName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- عملات جاهزة: الريال السعودي هو الأساسي (يمكن تغييره من الإعدادات)
INSERT INTO `currencies` (`code`, `arName`, `enName`, `arSymbol`, `enSymbol`, `decimals`, `isBase`, `updatedAt`) VALUES
    ('SAR', 'ريال سعودي', 'Saudi Riyal', 'ر.س', 'SAR', 2, true, CURRENT_TIMESTAMP(3)),
    ('EGP', 'جنيه مصري', 'Egyptian Pound', 'ج.م', 'EGP', 2, false, CURRENT_TIMESTAMP(3)),
    ('AED', 'درهم إماراتي', 'UAE Dirham', 'د.إ', 'AED', 2, false, CURRENT_TIMESTAMP(3)),
    ('KWD', 'دينار كويتي', 'Kuwaiti Dinar', 'د.ك', 'KWD', 3, false, CURRENT_TIMESTAMP(3)),
    ('USD', 'دولار أمريكي', 'US Dollar', '$', 'USD', 2, false, CURRENT_TIMESTAMP(3)),
    ('EUR', 'يورو', 'Euro', '€', 'EUR', 2, false, CURRENT_TIMESTAMP(3));

-- طرق دفع جاهزة
INSERT INTO `payment_methods` (`arName`, `enName`, `type`, `requiresReference`, `sortOrder`, `updatedAt`) VALUES
    ('نقدي', 'Cash', 'cash', false, 1, CURRENT_TIMESTAMP(3)),
    ('مدى', 'Mada', 'card', true, 2, CURRENT_TIMESTAMP(3)),
    ('فيزا / ماستر كارد', 'Visa / Mastercard', 'card', true, 3, CURRENT_TIMESTAMP(3)),
    ('Apple Pay', 'Apple Pay', 'wallet', true, 4, CURRENT_TIMESTAMP(3)),
    ('تحويل بنكي', 'Bank transfer', 'transfer', true, 5, CURRENT_TIMESTAMP(3)),
    ('آجل', 'Credit', 'credit', false, 6, CURRENT_TIMESTAMP(3));
