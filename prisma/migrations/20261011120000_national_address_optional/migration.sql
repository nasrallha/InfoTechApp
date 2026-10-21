-- العنوان الوطني اختياري بالكامل للعملاء والموردين
-- تعديل الأعمدة فقط (NOT NULL ← NULL) بدون مسح أي بيانات

-- AlterTable
ALTER TABLE `customers` MODIFY `city` VARCHAR(100) NULL,
    MODIFY `district` VARCHAR(100) NULL,
    MODIFY `street` VARCHAR(100) NULL;

-- AlterTable
ALTER TABLE `suppliers` MODIFY `city` VARCHAR(100) NULL,
    MODIFY `district` VARCHAR(100) NULL,
    MODIFY `street` VARCHAR(100) NULL;
