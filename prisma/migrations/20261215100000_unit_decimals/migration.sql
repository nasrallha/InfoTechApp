-- الوحدة تقبل كسور (0.250) ولا لأ
-- الوحدات الموجودة كلها بتفضل تقبل كسور زي ما كانت (التاجر يقفل اللي عاوزه من شاشة الوحدات)
ALTER TABLE `units` ADD COLUMN `allowDecimals` BOOLEAN NOT NULL DEFAULT true;

-- وحدات جاهزة (لو مش موجودة بنفس الاسم العربي أو الإنجليزي)
-- الوزن والحجم بكسور، والعدد من غير كسور
INSERT IGNORE INTO `units` (`arName`, `enName`, `isActive`, `allowDecimals`, `createdAt`, `updatedAt`) VALUES
  ('كيلو', 'Kilogram', true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('جرام', 'Gram', true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('لتر', 'Liter', true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('مللي', 'Milliliter', true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('حبة', 'Piece', true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('قطعة', 'Item', true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('علبة', 'Box', true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('شدة', 'Pack', true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ربطة', 'Bunch', true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('دستة', 'Dozen', true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('كرتونة', 'Carton', true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
