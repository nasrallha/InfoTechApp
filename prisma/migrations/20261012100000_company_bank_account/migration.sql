-- الحساب البنكي للشركة + خيار إظهاره في الفاتورة (إضافة أعمدة فقط، بدون مسح أي بيانات)

-- AlterTable
ALTER TABLE `company` ADD COLUMN `bankAccountName` VARCHAR(150) NULL,
    ADD COLUMN `bankAccountNumber` VARCHAR(30) NULL,
    ADD COLUMN `bankName` VARCHAR(100) NULL,
    ADD COLUMN `iban` VARCHAR(34) NULL;

-- AlterTable
ALTER TABLE `invoice_print_settings` ADD COLUMN `showBankAccount` BOOLEAN NOT NULL DEFAULT false;
