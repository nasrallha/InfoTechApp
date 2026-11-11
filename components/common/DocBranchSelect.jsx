"use client";

import { useState } from "react";
import { Select, Tooltip } from "antd";
import { ShopOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import { useBranchList } from "@/components/layout/BranchList";
import { message } from "@/components/common/feedback";
import { switchBranchAction } from "@/actions/auth.actions";

// ============================================================
// فرع المستند (لمدير النظام بس): يعمل الفاتورة / السند / أي مستند على أي فرع
// - الافتراضي: الفرع الحالي
// - الاختيار = نفس مبدّل الفرع اللي فوق: كل حاجة في الشاشة بتتحدث على الفرع
//   (الرقم المتوقع برمزه، الأسعار، الرصيد، العملاء المتاحين) والحفظ بيتسجل عليه
// - غير مدير النظام (أو فرع واحد): مفيش حاجة بتظهر
// ============================================================
export default function DocBranchSelect({ size = "middle" }) {
  const user = useCurrentUser();
  const branches = useBranchList();
  const locale = useLocale();
  const t = useTranslations("Auth");
  const tAlerts = useTranslations("Alerts");
  const [loading, setLoading] = useState(false);

  if (!user?.isSuper || user.isOwner || branches.length < 2) return null;
  const nameOf = (b) => (locale === "ar" ? b.arName : b.enName);

  const onChange = async (branchId) => {
    if (branchId === user.branch.id) return;
    setLoading(true);
    const res = await switchBranchAction(branchId);
    setLoading(false);
    if (!res.success) return message.error(tAlerts(res.error));
    message.success(t("DocBranchSwitched"));
  };

  return (
    <Tooltip title={t("DocBranchHint")}>
      <Select
        size={size}
        value={user.branch.id}
        onChange={onChange}
        loading={loading}
        disabled={loading}
        prefix={<ShopOutlined />}
        popupMatchSelectWidth={false}
        style={{ minWidth: 150 }}
        options={branches.map((b) => ({ value: b.id, label: nameOf(b) }))}
      />
    </Tooltip>
  );
}
