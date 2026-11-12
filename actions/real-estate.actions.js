"use server";

// تأجير العقارات - الإعداد: الملّاك والعقارات والوحدات ونماذج العقود
// الإضافة والتعديل والحذف بصلاحية realEstate.manage

import { runAction } from "@/lib/action";
import { idField } from "@/validations/common.schema";
import {
  ownerSchema,
  propertySchema,
  templateSchema,
  unitSchema,
} from "@/validations/real-estate.schema";
import {
  deleteOwner,
  deleteProperty,
  deleteTemplate,
  deleteUnit,
  saveOwner,
  saveProperty,
  saveTemplate,
  saveUnit,
} from "@/services/real-estate.service";

const MANAGE = { permission: "realEstate.manage", refresh: true };

export async function saveOwnerAction(input) {
  return runAction(ownerSchema, input, (d) => saveOwner(d), MANAGE);
}
export async function deleteOwnerAction(id) {
  return runAction(idField, id, (d) => deleteOwner(d), MANAGE);
}

export async function savePropertyAction(input) {
  return runAction(propertySchema, input, (d, user) => saveProperty(d, user), MANAGE);
}
export async function deletePropertyAction(id) {
  return runAction(idField, id, (d, user) => deleteProperty(d, user), MANAGE);
}

export async function saveUnitAction(input) {
  return runAction(unitSchema, input, (d, user) => saveUnit(d, user), MANAGE);
}
export async function deleteUnitAction(id) {
  return runAction(idField, id, (d, user) => deleteUnit(d, user), MANAGE);
}

export async function saveTemplateAction(input) {
  return runAction(templateSchema, input, (d) => saveTemplate(d), MANAGE);
}
export async function deleteTemplateAction(id) {
  return runAction(idField, id, (d) => deleteTemplate(d), MANAGE);
}
