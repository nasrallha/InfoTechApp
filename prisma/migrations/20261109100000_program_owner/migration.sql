-- مالك البرنامج: علامة على المستخدم والدور المخفيين
-- (إضافة أعمدة فقط - بدون مسح أي بيانات)

ALTER TABLE `roles` ADD COLUMN `isOwner` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `users` ADD COLUMN `isOwner` BOOLEAN NOT NULL DEFAULT false;
