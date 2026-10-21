"use server";

// البوابة بين شاشة ملصقات الباركود والسيرفر
// كل العمليات تحتاج صلاحية "printing.update" (تعديل إعدادات الطباعة)

import { runAction } from "@/lib/action";
import {
  createLabelSchema,
  updateLabelSchema,
  deleteLabelsSchema,
  setDefaultLabelSchema,
} from "@/validations/barcode-label.schema";
import {
  createBarcodeLabel,
  updateBarcodeLabel,
  deleteBarcodeLabels,
  setDefaultBarcodeLabel,
} from "@/services/barcode-label.service";

const options = { permission: "printing.update", refresh: true };

export async function createBarcodeLabelAction(input) {
  return runAction(createLabelSchema, input, (data) => createBarcodeLabel(data), options);
}

export async function updateBarcodeLabelAction(input) {
  return runAction(updateLabelSchema, input, (data) => updateBarcodeLabel(data), options);
}

export async function setDefaultBarcodeLabelAction(id) {
  return runAction(setDefaultLabelSchema, id, (data) => setDefaultBarcodeLabel(data), options);
}

export async function deleteBarcodeLabelsAction(ids) {
  return runAction(deleteLabelsSchema, ids, (data) => deleteBarcodeLabels(data), options);
}
