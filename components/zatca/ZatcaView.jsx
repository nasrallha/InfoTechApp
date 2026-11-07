"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Space,
  Table,
  Tag,
  Tooltip,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExperimentOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  SyncOutlined,
  SettingOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import PageHeader from "@/components/common/PageHeader";
import { message, modal } from "@/components/common/feedback";
import { formatDate } from "@/lib/dates";
import {
  startZatcaGatewayAction,
  testZatcaGatewayAction,
} from "@/actions/zatca.actions";
import ZatcaUnitWizard from "./ZatcaUnitWizard";
import ZatcaSettingsCard from "./ZatcaSettingsCard";
import { EnvTag, StatusTag, showZatcaError, stepOf } from "./zatcaUi";
import { C } from "@/lib/theme";
import "@/components/common/table.css";
import "./zatca.css";

// ============================================================
// الربط مع الزكاة: حالة الخدمة + وحدة الربط لكل فرع
// canSetup: صلاحية تسجيل الفروع مع الهيئة (zatca.setup)
// ============================================================
export default function ZatcaView({ data, settings, canSetup }) {
  const [openId, setOpenId] = useState(null);
  const [testing, setTesting] = useState(false);
  const [starting, setStarting] = useState(false);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Zatca");
  const tAlerts = useTranslations("Alerts");
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  const { gateway, config, branches } = data;
  const openBranch = branches.find((b) => b.id === openId) ?? null;

  // الخدمة بتشتغل في الخلفية: نحدّث الصفحة كل شوية لحد ما تشتغل
  useEffect(() => {
    if (gateway.online || !gateway.starting) return undefined;
    const timer = setTimeout(() => router.refresh(), 5000);
    return () => clearTimeout(timer);
  }, [gateway, router]);

  const startService = async () => {
    setStarting(true);
    const res = await startZatcaGatewayAction();
    setStarting(false);
    if (!res.success) return showZatcaError(res, { t, tAlerts, locale });
    if (res.data?.online) message.success(t("Online"));
    else
      message.error(
        res.data?.error ? t(`gatewayError.${res.data.error}`) : t("Offline"),
      );
  };

  const runTest = async () => {
    setTesting(true);
    const res = await testZatcaGatewayAction();
    setTesting(false);
    if (!res.success) return showZatcaError(res, { t, tAlerts, locale });
    const r = res.data;
    (r.ok ? modal.success : modal.error)({
      title: r.ok ? t("TestPassed") : t("TestFailed"),
      content: (
        <ul style={{ margin: "8px 0 0", paddingInlineStart: 18 }}>
          {r.results.map((x) => (
            <li key={x.name}>
              {x.ok ? "✔" : "✘"} {t(`testDoc.${x.name}`)}
              {x.error ? ` — ${x.error}` : ""}
            </li>
          ))}
        </ul>
      ),
    });
    if (r.ok) message.success(t("TestPassed"));
  };

  const columns = [
    {
      title: t("Branch"),
      key: "branch",
      render: (_, b) => (
        <Space size={6}>
          <b>{nm(b)}</b>
          {!b.isActive && <Tag>{t("Inactive")}</Tag>}
          {b.missing.length > 0 && (
            <Tooltip
              title={
                <div>
                  <div>{t("MissingData")}</div>
                  <ul style={{ margin: 0, paddingInlineStart: 16 }}>
                    {b.missing.map((k) => (
                      <li key={k}>{t(`missing.${k}`)}</li>
                    ))}
                  </ul>
                </div>
              }
            >
              <WarningOutlined style={{ color: C.warning }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: t("Environment"),
      key: "env",
      render: (_, b) =>
        b.unit ? <EnvTag env={b.unit.environment} t={t} /> : "—",
    },
    {
      title: t("Status"),
      key: "status",
      render: (_, b) => (
        <Space size={4}>
          <StatusTag unit={b.unit} t={t} />
          {b.unit && b.unit.status !== "active" && (
            <span className="zatca-muted">
              {t("StepOf", { step: stepOf(b.unit), total: 5 })}
            </span>
          )}
        </Space>
      ),
    },
    {
      title: t("Certificate"),
      key: "cert",
      render: (_, b) => {
        const u = b.unit;
        if (!u?.certExpiresAt) return "—";
        const days = u.certDaysRemaining;
        return (
          <Space size={4} wrap>
            <span>{formatDate(u.certExpiresAt)}</span>
            <Tag color={days < 0 ? "red" : days <= 30 ? "orange" : "green"}>
              {days < 0 ? t("Expired") : t("DaysLeft", { days })}
            </Tag>
          </Space>
        );
      },
    },
    {
      title: t("Icv"),
      key: "icv",
      responsive: ["md"],
      render: (_, b) => (b.unit?.status === "active" ? b.unit.icv : "—"),
    },
    {
      title: "",
      key: "actions",
      width: 150,
      render: (_, b) => (
        <Button
          type={b.unit?.status === "active" ? "default" : "primary"}
          icon={<SettingOutlined />}
          onClick={() => setOpenId(b.id)}
        >
          {!b.unit
            ? canSetup
              ? t("Setup")
              : t("Details")
            : b.unit.status === "active" || !canSetup
              ? t("Details")
              : t("Continue")}
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title={t("Title")} />

      {config.masterKeySource === "file" && (
        <Alert
          type="info"
          showIcon
          closable
          className="mb-4"
          title={t("MasterKeyFile")}
          description={t("MasterKeyFileHint")}
        />
      )}

      <div className="zatca-cards">
        <Card
          size="small"
          title={t("Service")}
          extra={
            !gateway.online && (
              <Button
                size="small"
                type="link"
                icon={<ReloadOutlined />}
                onClick={() => router.refresh()}
              >
                {t("Refresh")}
              </Button>
            )
          }
        >
          <Space orientation="vertical" size={8} style={{ width: "100%" }}>
            <Space wrap>
              {gateway.online ? (
                <Tag icon={<CheckCircleOutlined />} color="success">
                  {t("Online")}
                </Tag>
              ) : gateway.starting ? (
                <Tag icon={<SyncOutlined spin />} color="processing">
                  {t("Starting")}
                </Tag>
              ) : (
                <Tag icon={<CloseCircleOutlined />} color="error">
                  {t("Offline")}
                </Tag>
              )}
              {gateway.online && (
                <span className="zatca-muted">
                  SDK {gateway.sdkVersion}
                  {gateway.rulesFound ? "" : ` · ${t("RulesMissing")}`}
                </span>
              )}
            </Space>
            {!gateway.online && (
              <div className="zatca-muted">
                {gateway.starting
                  ? t("StartingHint")
                  : gateway.error
                    ? t(`gatewayError.${gateway.error}`)
                    : t("OfflineHint")}
              </div>
            )}
            {canSetup && (
              <Space wrap>
                {!gateway.online && (
                  <Button
                    type="primary"
                    icon={<PoweroffOutlined />}
                    loading={starting}
                    onClick={startService}
                  >
                    {t("StartService")}
                  </Button>
                )}
                <Button
                  icon={<ExperimentOutlined />}
                  loading={testing}
                  disabled={!gateway.online}
                  onClick={runTest}
                >
                  {t("TestService")}
                </Button>
              </Space>
            )}
          </Space>
        </Card>

        <Card
          size="small"
          title={t("Company")}
          extra={<Link href="/settings/company">{t("EditCompany")}</Link>}
        >
          {data.company ? (
            <Descriptions
              size="small"
              column={1}
              items={[
                {
                  key: "n",
                  label: t("CompanyName"),
                  children: nm(data.company),
                },
                {
                  key: "v",
                  label: t("VatNumber"),
                  children: data.company.taxNo || (
                    <Tag color="red">{t("missing.taxNo")}</Tag>
                  ),
                },
              ]}
            />
          ) : (
            <Alert type="warning" showIcon title={t("NoCompany")} />
          )}
        </Card>
      </div>

      {settings && <ZatcaSettingsCard settings={settings} canEdit={canSetup} />}

      <Alert type="info" showIcon className="mb-4" title={t("PerBranchHint")} />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={branches}
        pagination={false}
        scroll={{ x: "max-content" }}
      />

      {openBranch && (
        <ZatcaUnitWizard
          branch={openBranch}
          gatewayOnline={gateway.online}
          canSetup={canSetup}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
