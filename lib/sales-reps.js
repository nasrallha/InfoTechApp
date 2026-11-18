// ============================================================
// المناديب (وحدة salesReps) - من غير قاعدة بيانات (السيرفر والواجهة)
// المندوب = مستخدم صلاحياته الفعلية فيها salesReps.rep
// (مدير النظام مش مندوب بالتلقائي: لازم الصلاحية تكون في دوره أو استثناءاته)
// ============================================================
export const REP_PERMISSION = "salesReps.rep";

export const isSalesRep = (user) =>
  Boolean(
    user &&
      !user.isOwner &&
      !user.moduleBlocked?.includes(REP_PERMISSION) &&
      user.permissions?.includes(REP_PERMISSION),
  );
