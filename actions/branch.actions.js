"use server";

// البوابة بين واجهة الفروع والسيرفر
// (الفروع لا تحتوي ملفات، فنستقبل كائناً عادياً وليس FormData)
// { refresh: true }: بعد النجاح تتحدث صفحة الفروع تلقائياً

import { runAction } from "@/lib/action";
import {
  createBranchSchema,
  updateBranchSchema,
  deleteBranchesSchema,
} from "@/validations/branch.schema";
import { createBranch, updateBranch, deleteBranches } from "@/services/branch.service";

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

export async function deleteBranchesAction(ids) {
  return runAction(deleteBranchesSchema, ids, (data) => deleteBranches(data), {
    permission: "branches.delete",
    refresh: true,
  });
}
