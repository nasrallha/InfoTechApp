"use server";

// المقاسات والألوان (وحدة variants)
// التوليد وتعديل السعر بصلاحية الأصناف، وشبكة المقاسات في الكاشير بصلاحية البيع

import { runAction } from "@/lib/action";
import { can } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { idField } from "@/validations/common.schema";
import {
  generateVariantsSchema,
  modelPriceSchema,
} from "@/validations/variant.schema";
import {
  generateVariants,
  getProductVariants,
  getSaleModelVariants,
  getVariantColors,
  setModelPrice,
} from "@/services/variant.service";
import { purchaseModelVariants } from "@/services/purchase.service";
import { assertModule } from "@/lib/modules";

export async function getProductVariantsAction(productId) {
  return runAction(
    idField,
    productId,
    (id, user) => getProductVariants(id, user),
    {
      permission: "products.view",
    },
  );
}

export async function generateVariantsAction(input) {
  return runAction(
    generateVariantsSchema,
    input,
    (d, user) => generateVariants(d, user),
    { permission: "products.create", refresh: true },
  );
}

export async function setModelPriceAction(input) {
  return runAction(modelPriceSchema, input, (d) => setModelPrice(d), {
    permission: "products.update",
    refresh: true,
  });
}

// الكاشير / فاتورة البيع / عرض السعر
export async function saleModelVariantsAction(modelId) {
  return runAction(idField, modelId, (id, user) => {
    if (
      !can(user, "sales.create") &&
      !can(user, "sales.pos") &&
      !can(user, "quotations.create") &&
      !can(user, "quotations.update")
    )
      throw new AppError("Forbidden");
    return getSaleModelVariants(id, user);
  });
}

// فاتورة الشراء: مقاسات الموديل (شبكة الكميات)
export async function purchaseModelVariantsAction(modelId) {
  return runAction(
    idField,
    modelId,
    async (id) => {
      await assertModule("variants");
      return purchaseModelVariants(id);
    },
    { permission: "purchases.create" },
  );
}

// الألوان اللي التاجر ضافها (لوحة الدواير)
export async function variantColorsAction() {
  return runAction(null, undefined, () => getVariantColors(), {
    permission: "products.view",
  });
}
