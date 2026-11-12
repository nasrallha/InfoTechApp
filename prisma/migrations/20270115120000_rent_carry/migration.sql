-- ------------------------------------------------------------
-- تأجير العقارات: الترحيل في السداد الجزئي
-- carried = المبلغ اللي اترحل من الدفعة للدفعة الجاية (carriedToId)
-- عشان إلغاء فاتورة الدفعة يرجّع المبلغ مكانه
-- ------------------------------------------------------------
ALTER TABLE `rent_installments`
    ADD COLUMN `carried` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    ADD COLUMN `carriedToId` INTEGER NULL;
