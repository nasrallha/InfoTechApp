-- ------------------------------------------------------------
-- الطلب الأونلاين للمطعم (لينك خارجي زي لينك الحجز)
-- - العميل بيطلب من المنيو ويحدد ميعاد الوصول، ويستلم من المحل أو في السيارة
-- - الطلب بيوصل للكاشير status = pending (جديد) ← قبول (open) أو رفض (cancelled)
-- - الدفع عند الاستلام (على وردية الكاشير)
-- ------------------------------------------------------------
ALTER TABLE `restaurant_orders`
    ADD COLUMN `source` VARCHAR(10) NOT NULL DEFAULT 'pos',
    ADD COLUMN `pickupAt` DATETIME(3) NULL,
    ADD COLUMN `pickupMode` VARCHAR(10) NULL,
    ADD COLUMN `carInfo` VARCHAR(100) NULL,
    ADD COLUMN `notes` VARCHAR(500) NULL;

CREATE INDEX `restaurant_orders_source_status_idx` ON `restaurant_orders`(`source`, `status`);

-- الإعدادات: التشغيل + مواعيد الاستقبال + وقت التحضير + فترة المواعيد + الاستلام في السيارة
ALTER TABLE `system_settings`
    ADD COLUMN `restaurantOnline` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `restaurantOnlineOpen` VARCHAR(5) NOT NULL DEFAULT '10:00',
    ADD COLUMN `restaurantOnlineClose` VARCHAR(5) NOT NULL DEFAULT '23:00',
    ADD COLUMN `restaurantPrepMin` INTEGER NOT NULL DEFAULT 20,
    ADD COLUMN `restaurantSlotMin` INTEGER NOT NULL DEFAULT 15,
    ADD COLUMN `restaurantCurbside` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `restaurantOnlineNote` VARCHAR(500) NULL;
