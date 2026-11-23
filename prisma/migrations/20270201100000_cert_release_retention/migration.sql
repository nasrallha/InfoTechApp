-- المستخلص الختامي: الإفراج عن حجز الضمان مع المستخلص (المبلغ + الدفعة المرتبطة)
ALTER TABLE `construction_certificates` ADD COLUMN `releasedRetention` DECIMAL(18, 4) NOT NULL DEFAULT 0;
ALTER TABLE `construction_certificates` ADD COLUMN `releasePaymentId` INTEGER NULL;
