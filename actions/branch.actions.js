"use server";

// البوابة بين واجهة الفروع والسيرفر
// (بيانات الفرع كائن عادي، والشعار لوحده بـ FormData وبيترفع على طول)
// { refresh: true }: بعد النجاح تتحدث صفحة الفروع تلقائياً

import { runAction } from "@/lib/action";
import {
  createBranchSchema,
  updateBranchSchema,
  deleteBranchesSchema,
} from "@/validations/branch.schema";
import {
  createBranch,
  updateBranch,
  deleteBranches,
  setBranchLogo,
} from "@/services/branch.service";
import { idField, imageField } from "@/validations/common.schema";
import { z } from "zod";

export async function createBranchAction(input) {
  return runAction(createBranchSchema, input, (data, user) => createBranch(data, user), {
    permission: "branches.create",
    refresh: true,
  });
}

export async function updateBranchAction(input) {
  return runAction(updateBranchSchema, input, (data) => updateBranch(data), {
    permission: "branches.update",
    refresh: true,
  });
}

// شعار الفرع (FormData: id + image) - من غير صورة = حذف
export async function setBranchLogoAction(formData) {
  const file = formData.get("image");
  return runAction(
    z.object({ id: idField, image: imageField }),
    {
      id: Number(formData.get("id")),
      image: file instanceof File && file.size > 0 ? file : null,
    },
    (d) => setBranchLogo(d),
    { permission: "branches.update", refresh: true },
  );
}

export async function deleteBranchesAction(ids) {
  return runAction(deleteBranchesSchema, ids, (data) => deleteBranches(data), {
    permission: "branches.delete",
    refresh: true,
  });
}
