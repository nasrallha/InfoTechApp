-- المقاولات: رصيد دفعة مقدمة اتفوترت قبل كده برّه البرنامج (بيتسترد من المستخلصات)
ALTER TABLE `construction_contracts`
  ADD COLUMN `priorAdvance` DECIMAL(18, 4) NOT NULL DEFAULT 0 AFTER `advanceAmount`;
