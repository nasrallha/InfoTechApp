"use client";

import { useState } from "react";
import { Alert, Checkbox, Form } from "antd";
import { message } from "@/components/common/feedback";
import { CrownFilled } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { roleGroups } from "@/lib/permissions";
import { useCan, useCurrentUser } from "@/components/auth/AuthProvider";
import { setRolePermissionsAction } from "@/actions/role.actions";

// خانات الهيدر: ثابتة فوق وإنت نازل بالـ scroll
const TH = "p-2.5 font-bold sticky top-0 z-10 bg-(--c-header)";

// شاشة صلاحيات دور: جدول (المجموعات × العمليات) بـ checkboxes
// role: الدور المختار { id, isSuper, permissions: ["products.view", ...] }
// onSuccess, setLoading: يرسلها FormModal تلقائياً
export default function RolePermissionsForm({ role, onSuccess, setLoading }) {
  const [selected, setSelected] = useState(
    () => new Set(role?.permissions ?? []),
  );
  const t = useTranslations("Permissions");
  const tAlerts = useTranslations("Alerts");
  const can = useCan();
  // صلاحيات مالك البرنامج مش بتظهر هنا (مش بتتدي لأي دور)
  // وصلاحيات وحدات النشاط المقفولة عند الشركة كمان
  const currentUser = useCurrentUser();
  // المقفول على الشركة (الوحدة / الباقة / من اللوحة) مبيظهرش ولا بيتدي
  const groups = roleGroups(currentUser?.ownerMode, [
    ...(currentUser?.moduleBlocked ?? []),
    ...(currentUser?.planBlocked ?? []),
  ]);
  // كل العمليات الموجودة في المجموعات (أعمدة الجدول): عرض، إضافة، تعديل، حذف، ...
  const ACTIONS = [...new Set(groups.flatMap((g) => g.actions))];

  if (!role) return null;

  // لا يعطي المستخدم صلاحية هو نفسه لا يملكها (السيرفر يرفضها أيضاً)
  const allowed = (permission) => can(permission);

  const toggle = (permissions, checked) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of permissions) {
        if (!allowed(p)) continue;
        if (checked) next.add(p);
        else next.delete(p);
      }
      return next;
    });
  };

  // حالة "تحديد الكل" لمجموعة صلاحيات: كلها / بعضها / لا شيء
  const stateOf = (permissions) => {
    const count = permissions.filter((p) => selected.has(p)).length;
    return {
      checked: count > 0 && count === permissions.length,
      indeterminate: count > 0 && count < permissions.length,
    };
  };

  const groupPermissions = (g) => g.actions.map((a) => `${g.key}.${a}`);
  const everything = groups.flatMap(groupPermissions);

  const onFinish = async () => {
    setLoading?.(true);
    const res = await setRolePermissionsAction({
      roleId: role.id,
      permissions: [...selected].filter((p) => everything.includes(p)),
    });
    setLoading?.(false);

    if (!res.success) {
      message.error(tAlerts(res.error));
      return;
    }

    message.success(tAlerts("PermissionsSaved"));
    onSuccess?.();
  };

  // دور مدير النظام: له كل شيء تلقائياً
  if (role.isSuper) {
    return (
      <Form
        id="RolePermissionsForm"
        onFinish={() => onSuccess?.()}
        style={{ padding: 16 }}
      >
        <Alert
          type="warning"
          showIcon
          icon={<CrownFilled />}
          title={t("SuperRoleTitle")}
          description={t("SuperRoleText")}
        />
      </Form>
    );
  }

  return (
    <Form
      id="RolePermissionsForm"
      onFinish={onFinish}
      style={{ padding: "12px 12px 0" }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-slate-500">
          {t("SelectedCount", {
            count: selected.size,
            total: everything.length,
          })}
        </span>
        <Checkbox
          {...stateOf(everything)}
          onChange={(e) => toggle(everything, e.target.checked)}
        >
          <span className="font-bold">{t("SelectAll")}</span>
        </Checkbox>
      </div>

      {/* الجدول ليه scroll جواه، والهيدر (العمليات) ثابت فوق وإنت نازل */}
      <div
        className="overflow-auto rounded-lg border border-slate-200"
        style={{ maxHeight: "calc(100vh - 290px)" }}
      >
        <table className="w-full text-center border-collapse">
          <thead>
            <tr className={"bg-(--c-header) text-white"}>
              <th className={`${TH} text-start`}>{t("Group")}</th>
              {ACTIONS.map((action) => (
                <th key={action} className={`${TH} whitespace-nowrap`}>
                  {t(`actions.${action}`)}
                </th>
              ))}
              <th className={TH}>{t("All")}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const perms = groupPermissions(group);
              return (
                <tr
                  key={group.key}
                  className="border-t border-slate-200 odd:bg-white even:bg-slate-50 hover:bg-teal-50"
                >
                  <td className="p-2.5 text-start font-bold text-slate-700 whitespace-nowrap">
                    {t(`groups.${group.key}`)}
                  </td>
                  {ACTIONS.map((action) => {
                    // العملية غير موجودة في هذه المجموعة ← خانة فارغة
                    if (!group.actions.includes(action))
                      return <td key={action} className="p-2.5" />;
                    const permission = `${group.key}.${action}`;
                    return (
                      <td key={action} className="p-2.5">
                        <Checkbox
                          checked={selected.has(permission)}
                          disabled={!allowed(permission)}
                          onChange={(e) =>
                            toggle([permission], e.target.checked)
                          }
                        />
                      </td>
                    );
                  })}
                  <td className="p-2.5">
                    <Checkbox
                      {...stateOf(perms)}
                      onChange={(e) => toggle(perms, e.target.checked)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400 mt-3 mb-0">{t("ViewHint")}</p>
    </Form>
  );
}
