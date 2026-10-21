"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Tooltip } from "antd";
import { UserAddOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { useCan } from "@/components/auth/AuthProvider";
import FormModal from "@/components/common/FormModal";
import PartyForm from "./PartyForm";
import { PARTY_CONFIG } from "./partyConfig";

// ============================================================
// إضافة سريعة لعميل / مورد من جوه شاشات البيع والشراء والكاشير
// بيفتح نفس فورم العملاء/الموردين، وبعد الحفظ بيرجّع الجديد (onCreated)
// عشان الشاشة تختاره على طول
// kind: "customers" | "suppliers"
// يظهر بس لو المستخدم عنده صلاحية الإضافة
// اختصار الكيبورد: F8 (لو مفيش نافذة تانية مفتوحة)
// ============================================================
export const QUICK_ADD_KEY = "F8";

export default function QuickAddParty({ kind, onCreated, size }) {
  const [open, setOpen] = useState(false);
  const [nextCode, setNextCode] = useState(null);
  const [loadingCode, setLoadingCode] = useState(false);
  const config = PARTY_CONFIG[kind];
  const can = useCan();
  const tButtons = useTranslations("Buttons");
  const tHeadings = useTranslations("Headings");
  const allowed = can(`${config.permission}.create`);

  // الكود التالي بيتجاب لحظة الفتح (الفورم بياخده كقيمة أولية)
  const openForm = async () => {
    setLoadingCode(true);
    const res = await config.nextCodeAction();
    setLoadingCode(false);
    setNextCode(res.success ? res.data : null);
    setOpen(true);
  };

  const openRef = useRef(openForm);
  openRef.current = openForm;
  useEffect(() => {
    if (!allowed) return undefined;
    const onKey = (e) => {
      if (e.key !== QUICK_ADD_KEY) return;
      // فيه نافذة مفتوحة (دفع، خصم ...): منفتحش فوقها
      if (
        document.querySelector(".ant-modal-wrap:not([style*='display: none'])")
      )
        return;
      e.preventDefault();
      openRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allowed]);

  if (!allowed) return null;
  const { Icon } = config;
  const formId = `QuickAdd-${kind}`;

  return (
    <>
      <Tooltip title={`${tButtons(config.addButton)} (${QUICK_ADD_KEY})`}>
        <Button
          size={size}
          icon={<UserAddOutlined />}
          aria-label={tButtons(config.addButton)}
          loading={loadingCode}
          onClick={openForm}
        />
      </Tooltip>

      <FormModal
        open={open}
        width={900}
        formId={formId}
        title={
          <>
            <Icon style={{ fontSize: 22, marginInlineEnd: 6 }} />
            {tHeadings(config.addHeading)}
          </>
        }
        onCancel={(created) => {
          setOpen(false);
          if (created?.id) onCreated?.(created);
        }}
      >
        <PartyForm formId={formId} config={config} nextCode={nextCode} />
      </FormModal>
    </>
  );
}
