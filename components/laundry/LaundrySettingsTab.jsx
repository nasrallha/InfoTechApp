"use client";

import { useState } from "react";
import { Button, Card, Col, Form, InputNumber, Row, Switch } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCan } from "@/components/auth/AuthProvider";
import { saveLaundryWalletSettingsAction } from "@/actions/laundry-order.actions";
import { C } from "@/lib/theme";

// ============================================================
// إعدادات اشتراكات المغسلة
// - المدة بالشهور: 0 = الاشتراك لحد ما الرصيد يخلص، غير كده بيخلص بعد المدة
//   حتى لو فيه رصيد (المدة بتتحسب من يوم الاشتراك)
// - مكافأة الاشتراك خصم: الضريبة على اللي العميل دفعه فعلاً
// ============================================================
export default function LaundrySettingsTab({ settings }) {
  const t = useTranslations("Laundry");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const can = useCan();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const months = Form.useWatch("months", form) ?? settings.months;

  const save = async (v) => {
    setSaving(true);
    const res = await saveLaundryWalletSettingsAction({
      months: v.months ?? 0,
      bonusDiscount: Boolean(v.bonusDiscount),
    });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Saved"));
  };

  return (
    <div className="settings-masonry">
      <Card size="small" title={t("WalletSettings")}>
        <Form
          form={form}
          layout="vertical"
          autoComplete="off"
          initialValues={settings}
          onFinish={save}
          disabled={!can("laundry.manage")}
        >
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                name="months"
                label={t("WalletMonths")}
                tooltip={t("WalletMonthsHint")}
              >
                <InputNumber
                  min={0}
                  max={120}
                  precision={0}
                  suffix={t("MonthsUnit")}
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="bonusDiscount"
                label={t("WalletBonusDiscount")}
                tooltip={t("WalletBonusDiscountHint")}
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
          </Row>
          <div className="mb-3" style={{ color: C.muted, fontSize: 13 }}>
            {months > 0
              ? t("WalletMonthsOn", { n: months })
              : t("WalletMonthsOff")}
          </div>
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={saving}
          >
            {t("Save")}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
