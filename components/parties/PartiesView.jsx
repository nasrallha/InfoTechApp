"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useCan } from "@/components/auth/AuthProvider";
import PageHeader from "@/components/common/PageHeader";
import { PartiesExport } from "@/components/reports/ListExports";
import FormModal from "@/components/common/FormModal";
import PartyForm from "./PartyForm";
import PartyTable from "./PartyTable";
import { PARTY_CONFIG } from "./partyConfig";

// صفحة العملاء أو الموردين (الجزء التفاعلي)
// kind: "customers" أو "suppliers"
// parties: البيانات من السيرفر (تتحدث تلقائياً بعد أي عملية)
// nextCode: الكود الذي سيأخذه العميل/المورد الجديد (للعرض فقط)
export default function PartiesView({ kind, parties, nextCode }) {
  const config = PARTY_CONFIG[kind];
  const [addModalOpen, setAddModalOpen] = useState(false);
  // المحدد في الجدول (للتصدير)
  const [selectedIds, setSelectedIds] = useState([]);

  const tSidebar = useTranslations("Sidebar");
  const tButtons = useTranslations("Buttons");
  const can = useCan();
  const tHeadings = useTranslations("Headings");

  const { Icon } = config;

  return (
    <>
      <PageHeader
        extra={
          <PartiesExport
            kind={kind}
            parties={parties}
            selectedIds={selectedIds}
          />
        }
        title={tSidebar(config.title)}
        buttonTitle={can(`${config.permission}.create`) ? tButtons(config.addButton) : null}
        onButtonClick={() => setAddModalOpen(true)}
      />

      <FormModal
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        width={900}
        title={
          <>
            <Icon style={{ fontSize: 22, marginInlineEnd: 6 }} />
            {tHeadings(config.addHeading)}
          </>
        }
        formId="AddPartyForm"
      >
        <PartyForm formId="AddPartyForm" config={config} nextCode={nextCode} />
      </FormModal>

      <PartyTable
        parties={parties}
        config={config}
        onSelectionChange={setSelectedIds}
      />
    </>
  );
}
