-- صلاحية «عرض مستندات المستخدمين الآخرين» (documents.viewAll)
-- من غيرها المستخدم بيشوف المستندات اللي عملها بنفسه بس
-- كل الأدوار الموجودة بتاخدها (عشان محدش يتفاجئ إن الفواتير اختفت)، والمدير يشيلها من اللي عايزه
INSERT IGNORE INTO `role_permissions` (`roleId`, `permission`)
SELECT `id`, 'documents.viewAll' FROM `roles` WHERE `isOwner` = 0 AND `isSuper` = 0;
