import "server-only";
import { can } from "@/lib/permissions";

// ============================================================
// العملاء والموردين حسب الفروع (زي إتاحة الأصناف في المستودعات)
// - allBranches = true: متاح في كل الفروع
// - غير كده: متاح في الفروع المسجّلة (customer_branches / supplier_branches)
// - موظف الفرع: بيشوف ويتعامل مع الأطراف المتاحة في فرعه بس،
//   والطرف الجديد بيتاح لفرعه تلقائي
// - صاحب "عرض كل الفروع": بيشوف الكل، ويحدد الإتاحة
// ============================================================

export const canAllBranches = (user) => !user || can(user, "allBranches.view");

// الطرف متاح في فرع معيّن (شرط where)
export const partyInBranch = (branchId) => ({
  OR: [{ allBranches: true }, { branches: { some: { branchId } } }],
});

// شرط الظهور للمستخدم
export const partyBranchWhere = (user) =>
  canAllBranches(user) ? {} : partyInBranch(user.branch.id);

// الإتاحة عند الحفظ ← { allBranches, branchIds }
// input: { allBranches?, branchIds? } من الفورم
// current: الإتاحة الحالية في التعديل (undefined في الإضافة)
export function resolvePartyBranches(user, input, current) {
  const isEdit = current !== undefined;
  const own = {
    allBranches: false,
    branchIds: [user?.branch?.id].filter(Boolean),
  };
  // موظف الفرع: الجديد على فرعه، والتعديل مبيغيرش الإتاحة
  if (!canAllBranches(user)) return isEdit ? current : own;
  // الفورم مبعتش إتاحة (الإضافة السريعة من شاشة البيع/الشراء): فرع المستخدم
  if (input?.allBranches === undefined) return isEdit ? current : own;
  if (input.allBranches) return { allBranches: true, branchIds: [] };
  const ids = [...new Set(input.branchIds ?? [])];
  return ids.length ? { allBranches: false, branchIds: ids } : own;
}

// فرع كشف الحساب: موظف الفرع ← حركات فرعه بس، والباقي ← كل الفروع (null)
export const statementBranch = (user) =>
  canAllBranches(user) ? null : user.branch.id;

// الرصيد الافتتاحي بيتحسب في كشف فرع لو الطرف متاح في الفرع ده بس
// (الطرف المتاح في أكتر من فرع: رصيده الافتتاحي في كشف كل الفروع)
export const ownsOpening = (party, branchId) =>
  !branchId ||
  (!party.allBranches &&
    party.branches?.length === 1 &&
    party.branches[0].branchId === branchId);
