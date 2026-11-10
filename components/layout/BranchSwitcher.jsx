"use client";
import { useState } from "react";
import { Button, Dropdown, Grid, Select, Tooltip } from "antd";
import { message } from "@/components/common/feedback";
import { ShopOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import { switchBranchAction } from "@/actions/auth.actions";

// الفرع الحالي في الهيدر
// - مدير النظام: قائمة يختار منها أي فرع، فتتحدث كل الصفحات على الفرع الجديد
// - غيره: لا يظهر شيء هنا (فرعه مكتوب تحت اسمه في منتصف الهيدر)
export default function BranchSwitcher({ branches = [] }) {
  const user = useCurrentUser();
  const locale = useLocale();
  const t = useTranslations("Auth");
  const tAlerts = useTranslations("Alerts");
  const [loading, setLoading] = useState(false);
  // الموبايل: أيقونة صغيرة بتفتح قائمة الفروع (عشان متغطيش على زر القائمة)
  const screens = Grid.useBreakpoint();
  const isMobile = screens.md === false;

  const nameOf = (b) => (locale === "ar" ? b.arName : b.enName);

  if (!user) return null;

  // غير مدير النظام: الفرع ظاهر تحت اسمه في منتصف الهيدر، فلا نكرره هنا
  if (!user.isSuper || branches.length < 2) return null;
  // مالك البرنامج: الفرع مش بيظهر فوق
  if (user.isOwner) return null;

  const onChange = async (branchId) => {
    setLoading(true);
    const res = await switchBranchAction(branchId);
    setLoading(false);

    if (!res.success) {
      message.error(tAlerts(res.error));
      return;
    }
    message.success(t("BranchSwitched"));
  };

  if (isMobile)
    return (
      <Dropdown
        trigger={["click"]}
        menu={{
          selectable: true,
          selectedKeys: [String(user.branch.id)],
          items: branches.map((b) => ({
            key: String(b.id),
            label: nameOf(b),
          })),
          onClick: ({ key }) =>
            Number(key) !== user.branch.id && onChange(Number(key)),
        }}
      >
        <Button
          type="text"
          shape="circle"
          size="large"
          loading={loading}
          aria-label={t("CurrentBranch")}
          icon={<ShopOutlined style={{ fontSize: 20 }} />}
        />
      </Dropdown>
    );

  return (
    <Tooltip title={t("CurrentBranch")}>
      <Select
        value={user.branch.id}
        onChange={onChange}
        loading={loading}
        disabled={loading}
        prefix={<ShopOutlined />}
        style={{ minWidth: 180 }}
        options={branches.map((b) => ({ value: b.id, label: nameOf(b) }))}
      />
    </Tooltip>
  );
}
