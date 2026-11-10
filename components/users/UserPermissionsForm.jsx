"use client";

import { useState } from "react";
import { Alert, Button, Checkbox, Form, Space, Tag } from "antd";
import { CrownFilled, UndoOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { roleGroups, userPermissions } from "@/lib/permissions";
import { useCan, useCurrentUser } from "@/components/auth/AuthProvider";
import { setUserPermissionsAction } from "@/actions/user.actions";
import { C } from "@/lib/theme";

// خانات الهيدر: ثابتة فوق وإنت نازل بالـ scroll
const TH = "p-2.5 font-bold sticky top-0 z-10 bg-(--c-header)";

// ============================================================
// صلاحيات مستخدم: الدور قالب + استثناءات للمستخدم ده بس
// - رمادي: من الدور / أخضر: مضافة له / أحمر: محذوفة منه (موجودة في الدور)
// - "رجوع لصلاحيات الدور": يمسح استثناءاته
// - المقفول على الشركة (الباقة / اللوحة / الوحدات) مبيظهرش ولا بيتدّي
// - مبيدّيش صلاحية المستخدم الحالي نفسه مش عنده
// user: { id, role: { isSuper, permissions: [{ permission }] }, grantedPermissions, revokedPermissions }
// onSuccess, setLoading: يرسلها FormModal تلقائياً
// ============================================================
export default function UserPermissionsForm({ user, onSuccess, setLoading }) {
  const t = useTranslations("Permissions");
  const tU = useTranslations("UserPermissions");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const can = useCan();
  const currentUser = useCurrentUser();

  const rolePerms = new Set(
    (user?.role?.permissions ?? []).map((p) => p.permission ?? p),
  );
  const [selected, setSelected] = useState(
    () =>
      new Set(
        userPermissions(
          [...rolePerms],
          user?.grantedPermissions,
          user?.revokedPermissions,
        ),
      ),
  );

  // المقفول على الشركة مبيظهرش (ولا صلاحيات المالك)
  const groups = roleGroups(currentUser?.ownerMode, [
    ...(currentUser?.moduleBlocked ?? []),
    ...(currentUser?.planBlocked ?? []),
  ]);
  const ACTIONS = [...new Set(groups.flatMap((g) => g.actions))];
  const groupPermissions = (g) => g.actions.map((a) => `${g.key}.${a}`);
  const everything = groups.flatMap(groupPermissions);

  if (!user) return null;

  // الإضافة: بس اللي المستخدم الحالي عنده / الشيل: أي صلاحية
  const canSet = (p, checked) => !checked || rolePerms.has(p) || can(p);

  const toggle = (permissions, checked) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of permissions) {
        if (!canSet(p, checked)) continue;
        if (checked) next.add(p);
        else next.delete(p);
      }
      return next;
    });

  const stateOf = (permissions) => {
    const count = permissions.filter((p) => selected.has(p)).length;
    return {
      checked: count > 0 && count === permissions.length,
      indeterminate: count > 0 && count < permissions.length,
    };
  };

  // حالة الصلاحية مقارنة بالدور
  const statusOf = (p) =>
    selected.has(p)
      ? rolePerms.has(p)
        ? "role"
        : "granted"
      : rolePerms.has(p)
        ? "revoked"
        : "none";
  const CELL_BG = {
    granted: C.successSoft,
    revoked: C.dangerSoft,
  };
  const granted = everything.filter((p) => statusOf(p) === "granted").length;
  const revoked = everything.filter((p) => statusOf(p) === "revoked").length;

  // رجوع لصلاحيات الدور (يمسح الاستثناءات)
  const resetToRole = () =>
    setSelected(new Set([...rolePerms].filter((p) => everything.includes(p))));

  const onFinish = async () => {
    setLoading?.(true);
    const res = await setUserPermissionsAction({
      userId: user.id,
      permissions: [...selected].filter((p) => everything.includes(p)),
    });
    setLoading?.(false);
    if (!res.success) return message.error(tAlerts(res.error));
    message.success(tAlerts("PermissionsSaved"));
    onSuccess?.();
  };

  // مدير النظام: كل الصلاحيات تلقائياً
  if (user.role?.isSuper) {
    return (
      <Form
        id="UserPermissionsForm"
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
      id="UserPermissionsForm"
      onFinish={onFinish}
      style={{ padding: "12px 12px 0" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <Space wrap>
          <span className="text-slate-500">
            {tU("RoleIs", {
              role: locale === "ar" ? user.role?.arName : user.role?.enName,
            })}
          </span>
          <Tag className="cp-chip">{tU("FromRole")}</Tag>
          <Tag color="green">
            {tU("Granted")} ({granted})
          </Tag>
          <Tag color="red">
            {tU("Revoked")} ({revoked})
          </Tag>
        </Space>
        <Space wrap>
          <Button
            size="small"
            icon={<UndoOutlined />}
            disabled={!granted && !revoked}
            onClick={resetToRole}
          >
            {tU("ResetToRole")}
          </Button>
          <Checkbox
            {...stateOf(everything)}
            onChange={(e) => toggle(everything, e.target.checked)}
          >
            <span className="font-bold">{t("SelectAll")}</span>
          </Checkbox>
        </Space>
      </div>

      <div
        className="overflow-auto rounded-lg border border-slate-200"
        style={{ maxHeight: "calc(100vh - 290px)" }}
      >
        <table className="w-full text-center border-collapse">
          <thead>
            <tr className="bg-(--c-header) text-white">
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
                  className="border-t border-slate-200 odd:bg-white even:bg-slate-50"
                >
                  <td className="p-2.5 text-start font-bold text-slate-700 whitespace-nowrap">
                    {t(`groups.${group.key}`)}
                  </td>
                  {ACTIONS.map((action) => {
                    if (!group.actions.includes(action))
                      return <td key={action} className="p-2.5" />;
                    const permission = `${group.key}.${action}`;
                    const status = statusOf(permission);
                    return (
                      <td
                        key={action}
                        className="p-2.5"
                        style={{ background: CELL_BG[status] }}
                        title={
                          status === "granted"
                            ? tU("Granted")
                            : status === "revoked"
                              ? tU("Revoked")
                              : status === "role"
                                ? tU("FromRole")
                                : undefined
                        }
                      >
                        <Checkbox
                          checked={selected.has(permission)}
                          disabled={
                            !selected.has(permission) &&
                            !canSet(permission, true)
                          }
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

      <p className="text-xs text-slate-400 mt-3 mb-0">{tU("Hint")}</p>
    </Form>
  );
}
