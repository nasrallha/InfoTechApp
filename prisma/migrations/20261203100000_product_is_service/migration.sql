-- صنف خدمة (مصنعية، تركيب...): بيتباع ومالوش مخزون

-- AlterTable
ALTER TABLE `products` ADD COLUMN `isService` BOOLEAN NOT NULL DEFAULT false;
