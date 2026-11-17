-- المقاولات: المستخلص السريع (من غير عقد) + إلغاء المستخلص بمرتجع
ALTER TABLE `construction_contracts`
  ADD COLUMN `isDirect` BOOLEAN NOT NULL DEFAULT false AFTER `parentId`;

ALTER TABLE `construction_certificates`
  ADD COLUMN `clientRef` VARCHAR(60) NULL AFTER `netPayable`,
  ADD COLUMN `cancelled` BOOLEAN NOT NULL DEFAULT false AFTER `clientRef`,
  ADD COLUMN `returnDocId` INTEGER NULL AFTER `cancelled`;
