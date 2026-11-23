-- الطابعات لكل الأنشطة + فتح الدرج
-- طابعة الإيصالات وإعداد الدرج لكل جهاز
ALTER TABLE `device_print_settings` ADD COLUMN `receiptPrinterId` INTEGER NULL;
ALTER TABLE `device_print_settings` ADD COLUMN `drawerMode` VARCHAR(10) NULL;

-- مهمة الطباعة: فتح الدرج بعد الطباعة
ALTER TABLE `print_jobs` ADD COLUMN `openDrawer` BOOLEAN NOT NULL DEFAULT false;

-- سجل فتح الدرج يدوي (من غير بيع)
CREATE TABLE IF NOT EXISTS `drawer_open_logs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `branchId` INTEGER NOT NULL,
  `userId` INTEGER NOT NULL,
  `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reason` VARCHAR(200) NULL,
  INDEX `drawer_open_logs_branchId_openedAt_idx`(`branchId`, `openedAt`),
  INDEX `drawer_open_logs_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- صلاحية «فتح الدرج» يدوي: للأدوار اللي بتبيع في الكاشير
INSERT IGNORE INTO `role_permissions` (`roleId`, `permission`)
SELECT `roleId`, 'sales.openDrawer' FROM `role_permissions` WHERE `permission` = 'sales.pos';
