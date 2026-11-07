"use server";

// طابعات المطعم: الإضافة والتعديل والحذف (شاشة المطعم ← الطباعة)
import { runAction } from "@/lib/action";
import { idField } from "@/validations/common.schema";
import { savePrinterSchema } from "@/validations/restaurant.schema";
import { deletePrinter, savePrinter } from "@/services/restaurant-printer.service";

const manage = { permission: "restaurant.manage", refresh: true };

export const savePrinterAction = async (input) =>
  runAction(savePrinterSchema, input, (d) => savePrinter(d), manage);

export const deletePrinterAction = async (id) =>
  runAction(idField, id, (d) => deletePrinter(d), manage);
