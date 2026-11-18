-- وردية الفرع + أدراج الكاشير جواها + الانضمام لدرج كاشير تاني + إعدادات الورديات
-- الورديات القديمة: كل وردية بقت «درج» جوه وردية فرع خاصة بيها (نفس اليوم والترتيب والحالة)

-- إعدادات الورديات (المالك)
ALTER TABLE `system_settings` ADD COLUMN `shiftSettings` JSON NULL;

-- وردية الفرع
CREATE TABLE IF NOT EXISTS `branch_shifts` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `status` VARCHAR(10) NOT NULL DEFAULT 'open',
  `branchId` INTEGER NOT NULL,
  `businessDay` DATE NOT NULL,
  `dayNo` INTEGER NOT NULL,
  `periodArName` VARCHAR(50) NULL,
  `periodEnName` VARCHAR(50) NULL,
  `openedAt` DATETIME(3) NOT NULL,
  `openedById` INTEGER NOT NULL,
  `closedAt` DATETIME(3) NULL,
  `closedById` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `branch_shifts_branchId_businessDay_dayNo_key`(`branchId`, `businessDay`, `dayNo`),
  INDEX `branch_shifts_status_idx`(`status`),
  INDEX `branch_shifts_openedById_idx`(`openedById`),
  INDEX `branch_shifts_closedById_idx`(`closedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `branch_shifts`
    ADD CONSTRAINT `branch_shifts_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `branch_shifts`
    ADD CONSTRAINT `branch_shifts_openedById_fkey` FOREIGN KEY (`openedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `branch_shifts`
    ADD CONSTRAINT `branch_shifts_closedById_fkey` FOREIGN KEY (`closedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- الانضمام لدرج
CREATE TABLE IF NOT EXISTS `drawer_joins` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `shiftId` INTEGER NOT NULL,
  `userId` INTEGER NOT NULL,
  `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `leftAt` DATETIME(3) NULL,
  INDEX `drawer_joins_shiftId_idx`(`shiftId`),
  INDEX `drawer_joins_userId_leftAt_idx`(`userId`, `leftAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `drawer_joins`
    ADD CONSTRAINT `drawer_joins_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `shifts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `drawer_joins`
    ADD CONSTRAINT `drawer_joins_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- الدرج جوه وردية الفرع
ALTER TABLE `shifts` ADD COLUMN `branchShiftId` INTEGER NULL;
CREATE INDEX `shifts_branchShiftId_idx` ON `shifts`(`branchShiftId`);
ALTER TABLE `shifts`
    ADD CONSTRAINT `shifts_branchShiftId_fkey` FOREIGN KEY (`branchShiftId`) REFERENCES `branch_shifts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- كذا درج بنفس اليوم والترتيب: القيد الفريد بيتشال (index عادي مكانه، يتعمل الأول)
CREATE INDEX `shifts_branchId_businessDay_dayNo_idx` ON `shifts`(`branchId`, `businessDay`, `dayNo`);
DROP INDEX `shifts_branchId_businessDay_dayNo_key` ON `shifts`;

-- الورديات القديمة ← وردية فرع لكل واحدة (اليوم والترتيب كانوا فريدين لكل فرع)
INSERT IGNORE INTO `branch_shifts` (`status`, `branchId`, `businessDay`, `dayNo`, `openedAt`, `openedById`, `closedAt`, `closedById`, `createdAt`, `updatedAt`)
SELECT s.`status`, s.`branchId`, s.`businessDay`, s.`dayNo`, s.`openedAt`, s.`userId`, s.`closedAt`, s.`closedById`, s.`createdAt`, NOW(3)
FROM `shifts` s
WHERE s.`branchShiftId` IS NULL;

UPDATE `shifts` s
JOIN `branch_shifts` b
  ON b.`branchId` = s.`branchId` AND b.`businessDay` = s.`businessDay` AND b.`dayNo` = s.`dayNo`
SET s.`branchShiftId` = b.`id`
WHERE s.`branchShiftId` IS NULL;

-- الانضمام لدرج: الأدوار اللي بتقفل أدراج الآخرين (المشرف) بتاخدها
-- (مدير النظام ليه كل الصلاحيات من غير صفوف)
INSERT IGNORE INTO `role_permissions` (`roleId`, `permission`)
SELECT rp.`roleId`, 'shifts.joinDrawer'
FROM `role_permissions` rp
WHERE rp.`permission` = 'shifts.close';
