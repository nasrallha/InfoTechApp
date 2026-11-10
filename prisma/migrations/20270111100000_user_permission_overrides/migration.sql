-- ------------------------------------------------------------
-- صلاحيات لكل مستخدم: الدور قالب + استثناءات للمستخدم
-- صلاحيات المستخدم = صلاحيات دوره + grantedPermissions - revokedPermissions
-- (فاضي = زي دوره بالظبط، فالمستخدمين الحاليين مبيتغيرش عندهم حاجة)
-- ------------------------------------------------------------
ALTER TABLE `users`
    ADD COLUMN `grantedPermissions` JSON NULL,
    ADD COLUMN `revokedPermissions` JSON NULL;
