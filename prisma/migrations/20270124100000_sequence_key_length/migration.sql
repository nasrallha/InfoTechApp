-- توسيع مفتاح الترقيم: مفاتيح السنوات المالية (النوع@الفرع@السنة) بتعدي 30 حرف
-- مثال: construction_certificate@12@2026
ALTER TABLE `document_sequences` MODIFY `key` VARCHAR(60) NOT NULL;
