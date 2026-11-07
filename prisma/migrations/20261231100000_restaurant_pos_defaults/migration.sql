-- ------------------------------------------------------------
-- إعدادات كاشير المطعم
-- - restaurantDefaultOrderType: نوع الطلب اللي الكاشير بيفتح عليه
--   (local محلي من غير طاولة | dinein طاولات | takeaway سفري | delivery توصيل | app تطبيق)
-- - restaurantDefaultTableId: الطاولة اللي بتتاخد لو الكاشير ماختارش (مثلًا طاولة 1)
-- ------------------------------------------------------------
ALTER TABLE `system_settings`
    ADD COLUMN `restaurantDefaultOrderType` VARCHAR(10) NOT NULL DEFAULT 'takeaway',
    ADD COLUMN `restaurantDefaultTableId` INTEGER NULL;
