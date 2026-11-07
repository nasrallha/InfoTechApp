"use client";

import { Alert, Button, Collapse, Result } from "antd";
import { DatabaseOutlined, ReloadOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { C } from "@/lib/theme";

// ============================================================
// شاشة واضحة لما قاعدة البيانات لا تعمل: إيه المشكلة وإيه الحل
// kind: unreachable / auth / notFound / schema (من lib/db-errors.js)
// details: تفاصيل تقنية (في وضع التطوير فقط)
// ============================================================
export default function DbErrorScreen({ kind = "unreachable", details }) {
  const t = useTranslations("DbError");
  const steps = t.raw(`${kind}.steps`);

  return (
    <div className="db-error">
      <Result
        status="error"
        icon={<DatabaseOutlined style={{ color: C.dangerText }} />}
        title={t(`${kind}.title`)}
        subTitle={t(`${kind}.text`)}
        extra={
          <Button
            type="primary"
            size="large"
            icon={<ReloadOutlined />}
            onClick={() => window.location.reload()}
          >
            {t("Retry")}
          </Button>
        }
      >
        <Alert
          type="info"
          showIcon
          title={t("WhatToDo")}
          description={
            <ol className="db-error__steps">
              {steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          }
        />
        {details && (
          <Collapse
            ghost
            className="mt-3"
            items={[
              {
                key: "d",
                label: t("TechnicalDetails"),
                children: <pre className="db-error__details">{details}</pre>,
              },
            ]}
          />
        )}
      </Result>
    </div>
  );
}
