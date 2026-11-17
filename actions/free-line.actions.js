"use server";

// البند الحر في فواتير البيع والشراء:
// - الصنف الداخلي (بشكل صنف الشاشة) عشان السطر يتضاف عادي
// - إعداد المالك للشركة (مفعّل / مقفول / حسب النشاط)

import { z } from "zod";
import { runAction } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { FREE_LINE_CODE } from "@/lib/free-line";
import { ensureFreeLineProduct, freeLinesEnabled, setFreeLines } from "@/services/free-line.service";
import { searchSaleProducts } from "@/services/sale-catalog.service";
import { searchPurchaseProducts } from "@/services/purchase.service";

// side: sale | purchase ← الصنف الداخلي بنفس شكل نتيجة البحث في الشاشة
export async function freeLineProductAction(side) {
  return runAction(z.enum(["sale", "purchase"]), side, async (s, user) => {
    const allowed = s === "sale" ? can(user, "sales.create") || can(user, "sales.update") : can(user, "purchases.create") || can(user, "purchases.update");
    if (!allowed) throw new AppError("Forbidden");
    if (!(await freeLinesEnabled())) throw new AppError("FreeLinesDisabled");
    await ensureFreeLineProduct();
    const rows = s === "sale" ? await searchSaleProducts(FREE_LINE_CODE, user) : await searchPurchaseProducts(FREE_LINE_CODE);
    const product = rows.find((p) => p.code === FREE_LINE_CODE);
    if (!product) throw new AppError("ProductNotFound");
    return product;
  });
}

// إعداد المالك: true مفعّل | false مقفول | null حسب النشاط
export async function setFreeLinesAction(value) {
  return runAction(z.boolean().nullable(), value, (v) => setFreeLines(v), {
    permission: "systemSettings.freeLines",
    refresh: true,
  });
}
