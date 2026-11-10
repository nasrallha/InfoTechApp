"use server";

// البوابة بين شاشات الإشعارات الدائنة والمدينة (العملاء والموردين) والسيرفر

import { z } from "zod";
import { runAction } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { idField } from "@/validations/common.schema";
import {
  createPurchaseNoteSchema,
  createSaleNoteSchema,
  findNoteInvoiceSchema,
  noteLineItemSchema,
  noteReasonSchema,
  noteProductSearchSchema,
  updatePurchaseNoteSchema,
  updateSaleNoteSchema,
} from "@/validations/note.schema";
import {
  createNote,
  deleteNote,
  updateNote,
  deleteNoteLineItem,
  deleteNoteReason,
  saveNoteReason,
  listNoteLineItems,
  saveNoteLineItem,
  findNoteInvoices,
  getNoteInvoice,
  searchNoteProducts,
} from "@/services/note.service";
import { afterSaleSaved } from "@/services/zatca-invoice.service";

const sideField = z.enum(["sale", "purchase"]);
const PERM = { sale: "salesNotes", purchase: "purchaseNotes" };

// إشعار للعميل: توقيع وإرسال للهيئة (لو الفرع مربوط)
export async function createSaleNoteAction(input) {
  return runAction(
    createSaleNoteSchema,
    input,
    async (d, user) => {
      const created = await createNote("sale", d, user);
      const zatca = await afterSaleSaved(created.id, { send: d.zatcaSend });
      return { ...created, zatca };
    },
    { permission: "salesNotes.create" },
  );
}

// إشعار من المورد (تسجيل بس)
export async function createPurchaseNoteAction(input) {
  return runAction(
    createPurchaseNoteSchema,
    input,
    (d, user) => createNote("purchase", d, user),
    { permission: "purchaseNotes.create" },
  );
}

// تعديل إشعار (قبل توقيعه للهيئة)
export async function updateSaleNoteAction(input) {
  return runAction(
    updateSaleNoteSchema,
    input,
    async (d, user) => {
      const saved = await updateNote("sale", d, user);
      // الفرع اتربط بالزكاة بعد الإضافة: يتوقّع ويتبعت دلوقتي
      const zatca = await afterSaleSaved(saved.id, { send: d.zatcaSend });
      return { ...saved, zatca };
    },
    { permission: "salesNotes.update" },
  );
}

export async function updatePurchaseNoteAction(input) {
  return runAction(
    updatePurchaseNoteSchema,
    input,
    (d, user) => updateNote("purchase", d, user),
    { permission: "purchaseNotes.update" },
  );
}

export async function deleteNoteAction(input) {
  return runAction(
    z.object({ side: sideField, id: idField }),
    input,
    (d, user) => {
      if (!can(user, `${PERM[d.side]}.delete`)) throw new AppError("Forbidden");
      return deleteNote(d.side, d.id, user);
    },
  );
}

// الفاتورة الأصلية: البحث برقمها، ثم تحميلها
export async function findNoteInvoicesAction(input) {
  return runAction(
    findNoteInvoiceSchema.extend({ side: sideField }),
    input,
    (d, user) => {
      if (
        !can(user, `${PERM[d.side]}.create`) &&
        !can(user, `${PERM[d.side]}.update`)
      )
        throw new AppError("Forbidden");
      return findNoteInvoices(d.side, d, user);
    },
  );
}

export async function getNoteInvoiceAction(input) {
  return runAction(
    z.object({
      side: sideField,
      id: idField,
      // تعديل إشعار: قيمة الفاتورة من غيره
      excludeNoteId: idField.nullish(),
    }),
    input,
    (d, user) => {
      if (
        !can(user, `${PERM[d.side]}.create`) &&
        !can(user, `${PERM[d.side]}.update`)
      )
        throw new AppError("Forbidden");
      return getNoteInvoice(d.side, d.id, user, {
        excludeNoteId: d.excludeNoteId ?? null,
      });
    },
  );
}

// الأصناف (سطر تصحيح السعر)
export async function searchNoteProductsAction(query) {
  return runAction(noteProductSearchSchema, query, (q, user) => {
    if (!can(user, "salesNotes.create") && !can(user, "purchaseNotes.create"))
      throw new AppError("Forbidden");
    return searchNoteProducts(q);
  });
}

// ------------------------------------------------------------
// بنود الإشعارات المضافة من المستخدم (لمن يعمل إشعارات عملاء أو موردين)
// ------------------------------------------------------------
const assertNoteMaker = (user) => {
  if (!can(user, "salesNotes.create") && !can(user, "purchaseNotes.create"))
    throw new AppError("Forbidden");
};

export async function listNoteLineItemsAction() {
  return runAction(z.any(), null, (_, user) => {
    assertNoteMaker(user);
    return listNoteLineItems();
  });
}

export async function saveNoteLineItemAction(input) {
  return runAction(noteLineItemSchema, input, (d, user) => {
    assertNoteMaker(user);
    return saveNoteLineItem(d);
  });
}

export async function deleteNoteLineItemAction(id) {
  return runAction(idField, id, (d, user) => {
    assertNoteMaker(user);
    return deleteNoteLineItem(d);
  });
}

// أسباب الإشعارات (إضافة / تعديل / حذف)
export async function saveNoteReasonAction(input) {
  return runAction(noteReasonSchema, input, (d, user) => {
    assertNoteMaker(user);
    return saveNoteReason(d);
  });
}

export async function deleteNoteReasonAction(id) {
  return runAction(idField, id, (d, user) => {
    assertNoteMaker(user);
    return deleteNoteReason(d);
  });
}
