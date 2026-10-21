"use server";

// البحث عن المنتجات في شاشة طباعة الباركود (بالاسم أو الكود أو بالماسح)

import { z } from "zod";
import { runAction } from "@/lib/action";
import { searchLabelProducts } from "@/services/barcode-print.service";

const searchSchema = z.string().trim().max(100);

export async function searchLabelProductsAction(query) {
  return runAction(searchSchema, query, (q) => searchLabelProducts(q), {
    permission: "barcodes.print",
  });
}
