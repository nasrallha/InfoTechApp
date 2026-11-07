-- حد عدد الأصناف في نسخة الاشتراك

-- AlterTable
ALTER TABLE `subscription` ADD COLUMN `maxProducts` INTEGER NULL;
