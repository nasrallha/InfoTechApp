-- طرق الدفع الثابتة من لوحة التحكم (قوالب طرق الدفع)

-- AlterTable
ALTER TABLE `payment_methods` ADD COLUMN `templateKey` VARCHAR(40) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `payment_methods_templateKey_key` ON `payment_methods`(`templateKey`);
