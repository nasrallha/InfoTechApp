-- ------------------------------------------------------------
-- رسوم الخدمة ورسوم التبغ: نسبة أو مبلغ
-- - *Type: percent نسبة من الصافي (والضريبة عليها) | amount مبلغ شامل الضريبة
--   الخدمة مبلغ: على الطلب كله | التبغ مبلغ: على كل وحدة من أصناف التبغ
--   (شيشة 25 شاملة + رسوم تبغ 25 = 50)
-- - القيمة نفسها في restaurantServicePercent / restaurantTobaccoPercent
--   (اتوسّعت عشان تشيل مبلغ)
-- ------------------------------------------------------------
ALTER TABLE `system_settings`
    ADD COLUMN `restaurantServiceType` VARCHAR(10) NOT NULL DEFAULT 'percent',
    ADD COLUMN `restaurantTobaccoType` VARCHAR(10) NOT NULL DEFAULT 'percent',
    MODIFY `restaurantServicePercent` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    MODIFY `restaurantTobaccoPercent` DECIMAL(18, 4) NOT NULL DEFAULT 0;

-- الطلب: قيمة الخدمة (نسبة أو مبلغ حسب الإعداد وقت الطلب)
ALTER TABLE `restaurant_orders`
    ADD COLUMN `serviceType` VARCHAR(10) NOT NULL DEFAULT 'percent',
    MODIFY `servicePercent` DECIMAL(18, 4) NOT NULL DEFAULT 0;

-- عدد الحبات (السمك...): الكاشير بيكتب الكيلو كام حبة عشان التحضير
ALTER TABLE `restaurant_items`
    ADD COLUMN `askPieces` BOOLEAN NOT NULL DEFAULT false;
