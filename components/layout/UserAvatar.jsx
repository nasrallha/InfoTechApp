"use client";
import { Avatar } from "antd";
import { useLocale, useTranslations } from "next-intl";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import { imageUrl } from "@/lib/image";

// صورة واسم المستخدم الحالي في منتصف الهيدر
// لو عنده صورة تظهر، وإلا أول حرف من اسمه
const UserAvatar = ({ hasName }) => {
  const user = useCurrentUser();
  const locale = useLocale();
  const t = useTranslations("Auth");

  if (!user) return null;

  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName);
  const fullName = locale === "ar" ? user.arFullname : user.enFullname;

  return (
    <div className="flex items-center gap-3 select-none min-w-0">
      <Avatar
        size={40}
        src={imageUrl(user.image)}
        style={{
          backgroundColor: "#006266",
          flexShrink: 0,
          boxShadow: "0 0 0 2px #fff, 0 0 0 4px #00626633",
        }}
      >
        {fullName?.trim()?.charAt(0)?.toUpperCase()}
      </Avatar>
      {hasName ? (
        <div className="leading-tight min-w-0 hidden sm:block">
          <div className="font-bold capitalize truncate">{fullName}</div>
          <div className="text-xs text-slate-500 truncate">
            {/* مالك البرنامج: من غير دور ولا فرع */}
            {user.isOwner
              ? t("ProgramOwner")
              : `${nameOf(user.role)} · ${nameOf(user.branch)}`}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default UserAvatar;
