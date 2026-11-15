-- ------------------------------------------------------------
-- الخياط: الثوب التفاعلي + مكتبة الرسومات
-- - part: شكل الاختيار على رسمة الثوب ("collar:shirt" / "preset:kuwaiti" ...)
-- - الاختيارات المبدئية ← صور المكتبة (public/tailoring/lib)
--   (بس لو صورتها لسه الجاهزة أو فاضية - المرفوعة من العميل مبتتغيرش)
-- ------------------------------------------------------------
ALTER TABLE `tailor_style_choices`
    ADD COLUMN `part` VARCHAR(30) NULL;

UPDATE `tailor_style_choices` SET `part` = 'preset:hijazi' WHERE `enName` = 'Hijazi' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'preset:kuwaiti' WHERE `enName` = 'Kuwaiti' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'preset:qatari' WHERE `enName` = 'Qatari' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'preset:ghazawi' WHERE `enName` = 'Ghazawi' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'collar:shirt' WHERE `enName` = 'Regular collar' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'collar:band1' WHERE `enName` = 'Mandarin collar' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'collar:round' WHERE `enName` = 'Round collar' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'collar:band2' WHERE `enName` = 'Two-button collar' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'collar:shirt' WHERE `enName` = 'Collar (5)' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'collar:band2' WHERE `enName` = 'Collar (6)' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'collar:shirt' WHERE `enName` = 'Collar (7)' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'cuff:plain' WHERE `enName` = 'Regular cuff' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'cuff:button' WHERE `enName` = 'Button cuff' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'cuff:angled' WHERE `enName` = 'Angled cuff' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'cuff:round' WHERE `enName` = 'Round cuff' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'placket:zipper' WHERE `enName` = 'Zipper' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'placket:hidden' WHERE `enName` = 'Hidden' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'placket:buttons' WHERE `enName` = 'Visible buttons' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'placket:hiddenButtons' WHERE `enName` = 'Hidden buttons' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'pocket:square' WHERE `enName` = 'Regular pocket' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'pocket:round' WHERE `enName` = 'Round pocket' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'pocket:pointed' WHERE `enName` = 'Angled pocket' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'pocket:flap' WHERE `enName` = 'Flap pocket' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'pocket:pointed' WHERE `enName` = 'Pocket (5)' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'pocket:pointed' WHERE `enName` = 'Pocket (6)' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'pocket:square' WHERE `enName` = 'Pocket (7)' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'pocket:pointed' WHERE `enName` = 'Pocket (8)' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'pocket:flap' WHERE `enName` = 'Pocket (9)' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'side:snap' WHERE `enName` = 'Snap side pockets' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'side:slit' WHERE `enName` = 'Regular side pockets' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'side:hidden' WHERE `enName` = 'Hidden side pockets' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'extra:phone' WHERE `enName` = 'Phone pocket' AND `part` IS NULL;
UPDATE `tailor_style_choices` SET `part` = 'extra:pen' WHERE `enName` = 'Pen pocket' AND `part` IS NULL;

UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/collars/b-16.png' WHERE `enName` = 'Regular collar' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/collars/b-2.png' WHERE `enName` = 'Mandarin collar' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/collars/b-14.png' WHERE `enName` = 'Round collar' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/collars/b-1.png' WHERE `enName` = 'Two-button collar' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/collars/b-15.png' WHERE `enName` = 'Collar (5)' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/collars/b-9.png' WHERE `enName` = 'Collar (6)' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/collars/b-19.png' WHERE `enName` = 'Collar (7)' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/cuffs/b-2001.png' WHERE `enName` = 'Regular cuff' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/cuffs/b-2004.png' WHERE `enName` = 'Button cuff' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/cuffs/b-2011.png' WHERE `enName` = 'Angled cuff' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/cuffs/b-2006.png' WHERE `enName` = 'Round cuff' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/plackets/b-1008.png' WHERE `enName` = 'Zipper' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/plackets/b-1001.png' WHERE `enName` = 'Hidden' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/plackets/b-1000.png' WHERE `enName` = 'Visible buttons' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/plackets/b-1006.png' WHERE `enName` = 'Hidden buttons' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/pockets/b-4007.png' WHERE `enName` = 'Regular pocket' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/pockets/b-4009.png' WHERE `enName` = 'Round pocket' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/pockets/b-4000.png' WHERE `enName` = 'Angled pocket' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/pockets/b-4013.png' WHERE `enName` = 'Flap pocket' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/pockets/b-4001.png' WHERE `enName` = 'Pocket (5)' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/pockets/b-4002.png' WHERE `enName` = 'Pocket (6)' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/pockets/b-4003.png' WHERE `enName` = 'Pocket (7)' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/pockets/b-4005.png' WHERE `enName` = 'Pocket (8)' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
UPDATE `tailor_style_choices` SET `image` = '/tailoring/lib/pockets/b-4014.png' WHERE `enName` = 'Pocket (9)' AND (`image` IS NULL OR `image` LIKE '/tailoring/%');
