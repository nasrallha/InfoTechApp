"use server";

// البوابة بين شاشة العروض والسيرفر (كل عملية بصلاحيتها)

import { runAction } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { idField } from "@/validations/common.schema";
import {
  promotionSchema,
  togglePromotionSchema,
} from "@/validations/promotion.schema";
import {
  deletePromotion,
  savePromotion,
  togglePromotion,
} from "@/services/promotion.service";

export async function savePromotionAction(input) {
  return runAction(
    promotionSchema,
    input,
    (d, user) => {
      if (!can(user, d.id ? "promotions.update" : "promotions.create")) {
        throw new AppError("Forbidden");
      }
      // التفعيل والإيقاف بصلاحية: بدونها العرض الجديد يتحفظ موقوف
      // (لحد ما حد عنده الصلاحية يفعّله)، والقديم يفضل على حالته
      const data = can(user, "promotions.activate")
        ? d
        : { ...d, isActive: d.id ? undefined : false };
      return savePromotion(data, user);
    },
    { refresh: true },
  );
}

// تفعيل / إيقاف العرض
export async function togglePromotionAction(input) {
  return runAction(
    togglePromotionSchema,
    input,
    (d) => togglePromotion(d.id, d.isActive),
    { permission: "promotions.activate", refresh: true },
  );
}

export async function deletePromotionAction(id) {
  return runAction(idField, id, (d) => deletePromotion(d), {
    permission: "promotions.delete",
    refresh: true,
  });
}
