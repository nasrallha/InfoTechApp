-- إعدادات الطباعة لكل جهاز: إعدادات الفواتير كاملة + قالب ملصق الباركود
-- (الجهاز بيتعرّف برقم في كوكي على الجهاز نفسه)
CREATE TABLE IF NOT EXISTS `device_print_settings` (
  `deviceKey` VARCHAR(40) NOT NULL,
  `invoice` JSON NULL,
  `barcodeLabelId` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`deviceKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
