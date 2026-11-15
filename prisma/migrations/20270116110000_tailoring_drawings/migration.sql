-- ------------------------------------------------------------
-- الخياط: رسومات التفاصيل من كارت الخياط (صور جاهزة في public/tailoring)
-- - الاختيارات المبدئية اللي لسه من غير صورة ← رسمتها
-- - الأشكال الزيادة في الكارت (رقبة / جيب) ← اختيارات جديدة بصورها
-- (الصورة اللي بتبدأ بـ / ملف جاهز في البرنامج، مش مرفوع)
-- ------------------------------------------------------------

UPDATE `tailor_style_choices` SET `image` = '/tailoring/model-hijazi.png' WHERE `enName` = 'Hijazi' AND `image` IS NULL;
UPDATE `tailor_style_choices` SET `image` = '/tailoring/model-kuwaiti.png' WHERE `enName` = 'Kuwaiti' AND `image` IS NULL;
UPDATE `tailor_style_choices` SET `image` = '/tailoring/model-qatari.png' WHERE `enName` = 'Qatari' AND `image` IS NULL;
UPDATE `tailor_style_choices` SET `image` = '/tailoring/model-ghazawi.png' WHERE `enName` = 'Ghazawi' AND `image` IS NULL;
UPDATE `tailor_style_choices` SET `image` = '/tailoring/collar-1.png' WHERE `enName` = 'Regular collar' AND `image` IS NULL;
UPDATE `tailor_style_choices` SET `image` = '/tailoring/collar-3.png' WHERE `enName` = 'Mandarin collar' AND `image` IS NULL;
UPDATE `tailor_style_choices` SET `image` = '/tailoring/collar-7.png' WHERE `enName` = 'Round collar' AND `image` IS NULL;
UPDATE `tailor_style_choices` SET `image` = '/tailoring/collar-5.png' WHERE `enName` = 'Two-button collar' AND `image` IS NULL;
UPDATE `tailor_style_choices` SET `image` = '/tailoring/cuff-4.png' WHERE `enName` = 'Regular cuff' AND `image` IS NULL;
UPDATE `tailor_style_choices` SET `image` = '/tailoring/cuff-3.png' WHERE `enName` = 'Angled cuff' AND `image` IS NULL;
UPDATE `tailor_style_choices` SET `image` = '/tailoring/cuff-2.png' WHERE `enName` = 'Round cuff' AND `image` IS NULL;
UPDATE `tailor_style_choices` SET `image` = '/tailoring/cuff-1.png' WHERE `enName` = 'Button cuff' AND `image` IS NULL;
UPDATE `tailor_style_choices` SET `image` = '/tailoring/placket-zipper.png' WHERE `enName` = 'Zipper' AND `image` IS NULL;
UPDATE `tailor_style_choices` SET `image` = '/tailoring/placket-hidden.png' WHERE `enName` = 'Hidden' AND `image` IS NULL;
UPDATE `tailor_style_choices` SET `image` = '/tailoring/placket-buttons.png' WHERE `enName` = 'Visible buttons' AND `image` IS NULL;
UPDATE `tailor_style_choices` SET `image` = '/tailoring/placket-hidden-buttons.png' WHERE `enName` = 'Hidden buttons' AND `image` IS NULL;
UPDATE `tailor_style_choices` SET `image` = '/tailoring/pocket-6.png' WHERE `enName` = 'Regular pocket' AND `image` IS NULL;
UPDATE `tailor_style_choices` SET `image` = '/tailoring/pocket-3.png' WHERE `enName` = 'Round pocket' AND `image` IS NULL;
UPDATE `tailor_style_choices` SET `image` = '/tailoring/pocket-8.png' WHERE `enName` = 'Angled pocket' AND `image` IS NULL;
UPDATE `tailor_style_choices` SET `image` = '/tailoring/pocket-2.png' WHERE `enName` = 'Flap pocket' AND `image` IS NULL;

INSERT INTO `tailor_style_choices` (`groupId`, `arName`, `enName`, `image`, `sortOrder`, `updatedAt`)
SELECT g.`id`, 'رقبة (5)', 'Collar (5)', '/tailoring/collar-2.png', 5, CURRENT_TIMESTAMP(3) FROM `tailor_style_groups` g
WHERE g.`enName` = 'Collar' AND NOT EXISTS (SELECT 1 FROM `tailor_style_choices` c WHERE c.`groupId` = g.`id` AND c.`enName` = 'Collar (5)');
INSERT INTO `tailor_style_choices` (`groupId`, `arName`, `enName`, `image`, `sortOrder`, `updatedAt`)
SELECT g.`id`, 'رقبة (6)', 'Collar (6)', '/tailoring/collar-4.png', 6, CURRENT_TIMESTAMP(3) FROM `tailor_style_groups` g
WHERE g.`enName` = 'Collar' AND NOT EXISTS (SELECT 1 FROM `tailor_style_choices` c WHERE c.`groupId` = g.`id` AND c.`enName` = 'Collar (6)');
INSERT INTO `tailor_style_choices` (`groupId`, `arName`, `enName`, `image`, `sortOrder`, `updatedAt`)
SELECT g.`id`, 'رقبة (7)', 'Collar (7)', '/tailoring/collar-6.png', 7, CURRENT_TIMESTAMP(3) FROM `tailor_style_groups` g
WHERE g.`enName` = 'Collar' AND NOT EXISTS (SELECT 1 FROM `tailor_style_choices` c WHERE c.`groupId` = g.`id` AND c.`enName` = 'Collar (7)');
INSERT INTO `tailor_style_choices` (`groupId`, `arName`, `enName`, `image`, `sortOrder`, `updatedAt`)
SELECT g.`id`, 'جيب (5)', 'Pocket (5)', '/tailoring/pocket-1.png', 5, CURRENT_TIMESTAMP(3) FROM `tailor_style_groups` g
WHERE g.`enName` = 'Pocket' AND NOT EXISTS (SELECT 1 FROM `tailor_style_choices` c WHERE c.`groupId` = g.`id` AND c.`enName` = 'Pocket (5)');
INSERT INTO `tailor_style_choices` (`groupId`, `arName`, `enName`, `image`, `sortOrder`, `updatedAt`)
SELECT g.`id`, 'جيب (6)', 'Pocket (6)', '/tailoring/pocket-4.png', 6, CURRENT_TIMESTAMP(3) FROM `tailor_style_groups` g
WHERE g.`enName` = 'Pocket' AND NOT EXISTS (SELECT 1 FROM `tailor_style_choices` c WHERE c.`groupId` = g.`id` AND c.`enName` = 'Pocket (6)');
INSERT INTO `tailor_style_choices` (`groupId`, `arName`, `enName`, `image`, `sortOrder`, `updatedAt`)
SELECT g.`id`, 'جيب (7)', 'Pocket (7)', '/tailoring/pocket-5.png', 7, CURRENT_TIMESTAMP(3) FROM `tailor_style_groups` g
WHERE g.`enName` = 'Pocket' AND NOT EXISTS (SELECT 1 FROM `tailor_style_choices` c WHERE c.`groupId` = g.`id` AND c.`enName` = 'Pocket (7)');
INSERT INTO `tailor_style_choices` (`groupId`, `arName`, `enName`, `image`, `sortOrder`, `updatedAt`)
SELECT g.`id`, 'جيب (8)', 'Pocket (8)', '/tailoring/pocket-7.png', 8, CURRENT_TIMESTAMP(3) FROM `tailor_style_groups` g
WHERE g.`enName` = 'Pocket' AND NOT EXISTS (SELECT 1 FROM `tailor_style_choices` c WHERE c.`groupId` = g.`id` AND c.`enName` = 'Pocket (8)');
INSERT INTO `tailor_style_choices` (`groupId`, `arName`, `enName`, `image`, `sortOrder`, `updatedAt`)
SELECT g.`id`, 'جيب (9)', 'Pocket (9)', '/tailoring/pocket-9.png', 9, CURRENT_TIMESTAMP(3) FROM `tailor_style_groups` g
WHERE g.`enName` = 'Pocket' AND NOT EXISTS (SELECT 1 FROM `tailor_style_choices` c WHERE c.`groupId` = g.`id` AND c.`enName` = 'Pocket (9)');
