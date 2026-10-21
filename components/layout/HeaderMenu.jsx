"use client";
import { useState } from "react";
import { Button, Dropdown } from "antd";
import { message } from "@/components/common/feedback";
import {
  MoreOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import { logoutAction } from "@/actions/auth.actions";

// زر النقاط الثلاث في آخر الهيدر: بيانات الحساب + تسجيل الخروج
export default function HeaderMenu() {
  const user = useCurrentUser();
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("Auth");
  const [loggingOut, setLoggingOut] = useState(false);

  if (!user) return null;

  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName);
  const fullName = locale === "ar" ? user.arFullname : user.enFullname;

  const logout = async () => {
    setLoggingOut(true);
    const res = await logoutAction();
    if (!res.success) {
      setLoggingOut(false);
      message.error(t("LogoutFailed"));
      return;
    }
    router.replace("/login");
  };

  const items = [
    {
      key: "info",
      disabled: true,
      label: (
        <div className="py-1" style={{ minWidth: 220 }}>
          <div className="font-bold text-slate-800">{fullName}</div>
          <div className="text-xs text-slate-500" dir="ltr">
            @{user.username}
          </div>
        </div>
      ),
    },
    { type: "divider" },
    // مالك البرنامج: "مالك البرنامج" بس (من غير دور ولا فرع)
    ...(user.isOwner
      ? [
          {
            key: "role",
            disabled: true,
            icon: <SafetyCertificateOutlined />,
            label: <span className="text-slate-600">{t("ProgramOwner")}</span>,
          },
        ]
      : [
          {
            key: "role",
            disabled: true,
            icon: <SafetyCertificateOutlined />,
            label: <span className="text-slate-600">{nameOf(user.role)}</span>,
          },
          {
            key: "branch",
            disabled: true,
            icon: <ShopOutlined />,
            label: <span className="text-slate-600">{nameOf(user.branch)}</span>,
          },
        ]),
    { type: "divider" },
    {
      key: "logout",
      danger: true,
      icon: <LogoutOutlined />,
      label: loggingOut ? t("LoggingOut") : t("Logout"),
      disabled: loggingOut,
      onClick: logout,
    },
  ];

  return (
    <Dropdown menu={{ items }} trigger={["click"]} placement="bottomRight">
      <Button
        type="text"
        shape="circle"
        size="large"
        aria-label={t("AccountMenu")}
        icon={<MoreOutlined style={{ fontSize: 22 }} />}
      />
    </Dropdown>
  );
}
