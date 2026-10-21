-- الرصيد الافتتاحي بالوحدات الإضافية (كرتونة، شدة ...)
-- رصيد الصنف الافتتاحي = startStock (بالوحدة الأساسية) + مجموع (رصيد الوحدة × معامل التحويل)
ALTER TABLE `product_units` ADD COLUMN `startStock` DECIMAL(18, 3) NOT NULL DEFAULT 0;
