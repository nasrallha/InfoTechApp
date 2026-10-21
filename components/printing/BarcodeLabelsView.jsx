"use client";

import { useState } from "react";
import { Button, Card, Col, Empty, Popconfirm, Row, Space, Tag, Tooltip } from "antd";
import { message } from "@/components/common/feedback";
import {
  BarcodeOutlined,
  DeleteOutlined,
  EditOutlined,
  StarFilled,
  StarOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import FormModal from "@/components/common/FormModal";
import { useCan } from "@/components/auth/AuthProvider";
import {
  deleteBarcodeLabelsAction,
  setDefaultBarcodeLabelAction,
} from "@/actions/barcode-label.actions";
import BarcodeLabelForm from "./BarcodeLabelForm";
import LabelPreview from "./LabelPreview";
import { sampleItem } from "./sample";
import { useCurrency } from "@/components/common/CurrencyProvider";
import "./printing.css";

// شاشة قوالب ملصقات الباركود: كروت فيها معاينة كل قالب
// labels: القوالب من السيرفر، companyName: اسم الشركة (يظهر على الملصق لو مفعّل)
export default function BarcodeLabelsView({ labels = [], companyName }) {
  const [modal, setModal] = useState({ open: false, label: null });
  const [busyId, setBusyId] = useState(null);

  const locale = useLocale();
  const t = useTranslations("Printing");
  const tButtons = useTranslations("Buttons");
  const tAlerts = useTranslations("Alerts");
  const tForm = useTranslations("Form");
  const can = useCan();
  const canEdit = can("printing.update");

  const nameOf = (l) => (locale === "ar" ? l.arName : l.enName);
  const item = sampleItem(locale);
  const { symbol: currency } = useCurrency(); // رمز العملة الأساسية

  // تنفيذ عملية على قالب مع رسالة نجاح/فشل
  const run = async (id, action, successKey) => {
    setBusyId(id);
    const res = await action();
    setBusyId(null);
    if (!res.success) {
      message.error(tAlerts(res.error));
      return;
    }
    message.success(tAlerts(successKey));
  };

  const openForm = (label = null) => setModal({ open: true, label });
  const closeForm = () => setModal({ open: false, label: null });

  return (
    <>
      <PageHeader
        title={t("BarcodeLabels")}
        buttonTitle={canEdit ? t("AddLabel") : null}
        onButtonClick={() => openForm()}
      />
      <p className="text-slate-500 -mt-3 mb-5">{t("PageHint")}</p>

      {labels.length === 0 ? (
        <Empty />
      ) : (
        <Row gutter={[16, 16]}>
          {labels.map((label) => (
            <Col key={label.id} xs={24} sm={12} lg={8} xxl={6}>
              <Card
                className={`label-card h-full ${label.isActive ? "" : "label-card--inactive"}`}
                styles={{ body: { padding: 16 } }}
              >
                {/* المعاينة */}
                <div className="label-card__stage">
                  <LabelPreview
                    label={label}
                    item={item}
                    companyName={companyName}
                    currency={currency}
                    maxWidth={240}
                    maxHeight={160}
                  />
                </div>

                {/* الاسم والمقاس */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-base truncate">{nameOf(label)}</div>
                    <div className="text-slate-500 text-sm" dir="ltr">
                      {label.width} × {label.height} mm · {label.barcodeFormat}
                    </div>
                  </div>
                  <Space size={4} wrap style={{ justifyContent: "flex-end" }}>
                    {label.isDefault && (
                      <Tag color="gold" icon={<StarFilled />}>
                        {t("Default")}
                      </Tag>
                    )}
                    {!label.isActive && <Tag>{tForm("NotActive")}</Tag>}
                  </Space>
                </div>

                {/* الأزرار */}
                {canEdit && (
                  <div className="flex items-center gap-2 mt-auto">
                    <Button
                      icon={<EditOutlined />}
                      onClick={() => openForm(label)}
                      style={{ flex: 1 }}
                    >
                      {tButtons("Edit")}
                    </Button>

                    {!label.isDefault && (
                      <Tooltip title={t("MakeDefault")}>
                        <Button
                          icon={<StarOutlined />}
                          loading={busyId === label.id}
                          onClick={() =>
                            run(
                              label.id,
                              () => setDefaultBarcodeLabelAction(label.id),
                              "LabelDefaultSet",
                            )
                          }
                        />
                      </Tooltip>
                    )}

                    {!label.isDefault && (
                      <Popconfirm
                        title={tAlerts("Confirm")}
                        description={tAlerts("ConfirmDelete")}
                        okText={tButtons("Yes")}
                        cancelText={tButtons("No")}
                        onConfirm={() =>
                          run(label.id, () => deleteBarcodeLabelsAction([label.id]), "LabelDeleted")
                        }
                      >
                        <Button danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    )}
                  </div>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <FormModal
        open={modal.open}
        onCancel={closeForm}
        width={1000}
        title={
          <>
            <BarcodeOutlined style={{ fontSize: 22, marginInlineEnd: 6 }} />
            {modal.label ? t("EditLabel") : t("AddLabel")}
          </>
        }
        formId="BarcodeLabelForm"
      >
        <BarcodeLabelForm formId="BarcodeLabelForm" label={modal.label} companyName={companyName} />
      </FormModal>
    </>
  );
}
