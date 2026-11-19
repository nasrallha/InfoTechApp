"use client";

import { useState } from "react";
import { Button, Form, Upload } from "antd";
import { DeleteOutlined, UploadOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { actionErrorText } from "@/components/common/actionError";
import { setBranchLogoAction } from "@/actions/branch.actions";
import { IMAGE_TYPES, imageUrl } from "@/lib/image";

// ============================================================
// شعار الفرع في المستندات المطبوعة (فاضي = شعار الشركة)
// بيترفع / يتمسح على طول (مش مع زرار حفظ الفرع)
// ============================================================
export default function BranchLogoField({ branch }) {
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");
  const [logo, setLogo] = useState(branch?.logo ?? null);
  const [busy, setBusy] = useState(false);

  const upload = async (file) => {
    setBusy(true);
    const fd = new FormData();
    fd.append("id", String(branch.id));
    if (file) fd.append("image", file);
    const res = await setBranchLogoAction(fd);
    setBusy(false);
    if (!res.success) return message.error(actionErrorText(res, tAlerts));
    setLogo(res.data.logo);
    message.success(tForm(file ? "BranchLogoSaved" : "BranchLogoRemoved"));
  };

  return (
    <Form.Item label={tForm("BranchLogo")} tooltip={tForm("BranchLogoHint")}>
      <div className="flex flex-wrap items-center gap-2">
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl(logo)}
            alt=""
            style={{ height: 48, maxWidth: 120, objectFit: "contain", border: "1px solid var(--c-border)", borderRadius: 6 }}
          />
        )}
        <Upload
          accept={IMAGE_TYPES.join(",")}
          showUploadList={false}
          disabled={busy}
          beforeUpload={(file) => {
            upload(file);
            return false;
          }}
        >
          <Button icon={<UploadOutlined />} loading={busy}>
            {tForm(logo ? "ChangeBranchLogo" : "UploadBranchLogo")}
          </Button>
        </Upload>
        {logo && (
          <Button danger icon={<DeleteOutlined />} disabled={busy} onClick={() => upload(null)} />
        )}
      </div>
    </Form.Item>
  );
}
