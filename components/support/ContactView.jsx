"use client";

import { Card, Col, Descriptions, Empty, Row, Tag } from "antd";
import { CustomerServiceOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import ContactButtons from "./ContactButtons";
import { C } from "@/lib/theme";
import "./support.css";

const STATE_COLORS = {
  active: "green",
  expiring: "gold",
  grace: "orange",
  readonly: "volcano",
  expired: "red",
  suspended: "red",
  cancelled: "default",
  pending: "default",
  missing: "default",
};

// ============================================================
// تواصل معنا: بيانات الشركة المالكة (من لوحة التحكم) + اشتراك الشركة
// ============================================================
export default function ContactView({ vendor, subscription: sub }) {
  const t = useTranslations("Support");
  const tAuth = useTranslations("Auth");
  const locale = useLocale();
  const ar = locale === "ar";
  const pick = (a, e) => (ar ? a || e : e || a) || null;
  const name = pick(vendor?.arName, vendor?.enName) ?? tAuth("AppName");
  const address = pick(vendor?.addressAr, vendor?.addressEn);
  const hours = pick(vendor?.hoursAr, vendor?.hoursEn);

  const rows = [
    vendor?.phone && [t("Phone"), vendor.phone],
    vendor?.phone2 && [t("Phone2"), vendor.phone2],
    vendor?.whatsapp && [t("Whatsapp"), `+${vendor.whatsapp}`],
    vendor?.email && [t("Email"), vendor.email],
    vendor?.website && [t("Website"), vendor.website],
    address && [t("Address"), address],
    hours && [t("Hours"), hours],
  ].filter(Boolean);

  return (
    <>
      <PageHeader title={t("ContactUs")} />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card>
            <div className="flex items-center gap-3 mb-4">
              {vendor?.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={vendor.logo} alt="" className="vendor-logo-lg" />
              ) : (
                <CustomerServiceOutlined
                  style={{ fontSize: 36, color: C.primary }}
                />
              )}
              <div>
                <div className="font-bold text-lg">{name}</div>
                <div className="text-gray-500">{t("ContactHint")}</div>
              </div>
            </div>
            {rows.length ? (
              <>
                <Descriptions
                  bordered
                  size="small"
                  column={1}
                  className="mb-4"
                  items={rows.map(([label, value], i) => ({
                    key: i,
                    label,
                    children: <bdi>{value}</bdi>,
                  }))}
                />
                <ContactButtons vendor={vendor} />
              </>
            ) : (
              <Empty description={t("NoContact")} />
            )}
          </Card>
        </Col>
        {sub && (
          <Col xs={24} lg={10}>
            <Card title={t("MySubscription")}>
              <Descriptions
                size="small"
                column={1}
                items={[
                  {
                    key: "state",
                    label: t("State"),
                    children: (
                      <Tag color={STATE_COLORS[sub.state]}>
                        {t(`state.${sub.state}`)}
                      </Tag>
                    ),
                  },
                  {
                    key: "plan",
                    label: t("Plan"),
                    children: pick(sub.planArName, sub.planEnName) ?? "—",
                  },
                  sub.endsAt && {
                    key: "ends",
                    label: t("EndsAt"),
                    children: <bdi>{sub.endsAt}</bdi>,
                  },
                  sub.endsAt && {
                    key: "left",
                    label: t("DaysLeft"),
                    children:
                      sub.daysLeft >= 0
                        ? t("Days", { n: sub.daysLeft })
                        : t("Ended"),
                  },
                  sub.companyCode && {
                    key: "code",
                    label: t("CompanyCode"),
                    children: <bdi className="font-mono">{sub.companyCode}</bdi>,
                  },
                  sub.companySerial && {
                    key: "serial",
                    label: t("CustomerNo"),
                    children: sub.companySerial,
                  },
                ].filter(Boolean)}
              />
            </Card>
          </Col>
        )}
      </Row>
    </>
  );
}
