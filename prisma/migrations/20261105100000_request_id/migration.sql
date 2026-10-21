-- بصمة الحفظ (idempotency) للفواتير والمرتجعات والسندات
-- لو الرد ضاع والمستخدم داس حفظ تاني: نفس البصمة ← نفس المستند (مفيش تكرار)
-- (إضافة أعمدة فقط - بدون مسح أي بيانات)

ALTER TABLE `sales` ADD COLUMN `requestId` VARCHAR(36) NULL;
CREATE UNIQUE INDEX `sales_requestId_key` ON `sales`(`requestId`);

ALTER TABLE `purchases` ADD COLUMN `requestId` VARCHAR(36) NULL;
CREATE UNIQUE INDEX `purchases_requestId_key` ON `purchases`(`requestId`);

ALTER TABLE `vouchers` ADD COLUMN `requestId` VARCHAR(36) NULL;
CREATE UNIQUE INDEX `vouchers_requestId_key` ON `vouchers`(`requestId`);
