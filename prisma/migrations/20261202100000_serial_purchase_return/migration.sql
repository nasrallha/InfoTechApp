-- الأرقام التسلسلية: القطع اللي رجعت للمورد بمرتجع مشتريات

-- AlterTable
ALTER TABLE `product_serials` ADD COLUMN `purchaseReturnItemId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `product_serials_purchaseReturnItemId_idx` ON `product_serials`(`purchaseReturnItemId`);

-- AddForeignKey
ALTER TABLE `product_serials` ADD CONSTRAINT `product_serials_purchaseReturnItemId_fkey` FOREIGN KEY (`purchaseReturnItemId`) REFERENCES `purchase_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
