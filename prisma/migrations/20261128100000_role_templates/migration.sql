-- الأدوار الثابتة من لوحة التحكم (قوالب الأدوار)

-- AlterTable
ALTER TABLE `roles` ADD COLUMN `templateKey` VARCHAR(40) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `roles_templateKey_key` ON `roles`(`templateKey`);
