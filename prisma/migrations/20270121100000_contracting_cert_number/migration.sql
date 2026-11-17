-- المقاولات: رقم المستخلص مسلسل واحد لكل المستخلصات (عقود + سريعة) لكل فرع زي الفواتير
ALTER TABLE `construction_certificates`
  ADD COLUMN `branchId` INTEGER NULL AFTER `seq`,
  ADD COLUMN `number` INTEGER NULL AFTER `branchId`,
  ADD COLUMN `docCode` VARCHAR(10) NULL AFTER `number`;

-- المستخلصات القديمة: فرع العقد + ترقيم بالترتيب (من غير رمز فرع)
UPDATE `construction_certificates` c
  JOIN `construction_contracts` k ON k.`id` = c.`contractId`
  SET c.`branchId` = k.`branchId`;

UPDATE `construction_certificates` c
  JOIN (
    SELECT `id`, ROW_NUMBER() OVER (PARTITION BY `branchId` ORDER BY `id`) AS `rn`
    FROM `construction_certificates`
  ) x ON x.`id` = c.`id`
  SET c.`number` = x.`rn`;

CREATE INDEX `construction_certificates_branchId_number_idx` ON `construction_certificates`(`branchId`, `number`);
