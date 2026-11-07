-- عرض الولاء: كل كام مرة مدفوعة ← المرة اللي بعدها مجانًا (أو بخصم)
ALTER TABLE `promotions` ADD COLUMN `loyaltyEvery` INTEGER NULL,
    ADD COLUMN `loyaltyTarget` VARCHAR(10) NULL;

-- عدد الوحدات اللي اتاخدت بالعرض على السطر (عشان العد يبدأ من الأول)
ALTER TABLE `sale_items` ADD COLUMN `loyaltyQty` DECIMAL(18, 4) NULL;
