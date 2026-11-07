"use client";
import { createContext, useContext } from "react";
import { can } from "@/lib/permissions";

// المستخدم الحالي متاح لكل مكونات الواجهة بدون تمريره من مكون لمكون
// ملاحظة: هذا لإخفاء الأزرار والقوائم فقط (شكل)، الحماية الحقيقية في السيرفر
const AuthContext = createContext(null);

export function AuthProvider({ user, children }) {
  return <AuthContext value={user}>{children}</AuthContext>;
}

// المستخدم الحالي: { arFullname, enFullname, isSuper, permissions, role, branch, ... }
export function useCurrentUser() {
  return useContext(AuthContext);
}

// دالة فحص الصلاحية داخل المكونات:
//   const can = useCan();
//   {can("units.create") && <Button ... />}
export function useCan() {
  const user = useContext(AuthContext);
  return (permission) => can(user, permission);
}

// وحدة النشاط مفعّلة للشركة؟ (شكل فقط، والسيرفر بيتحقق بنفسه)
//   const serialsOn = useModule("serials");
export function useModule(key) {
  const user = useContext(AuthContext);
  return Boolean(user?.modules?.includes(key));
}

// إعدادات الوحدات للواجهة (مثلاً { serialRequired })
export function useModuleSettings() {
  const user = useContext(AuthContext);
  return user?.moduleSettings ?? {};
}
