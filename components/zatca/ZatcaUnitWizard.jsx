"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Result,
  Select,
  Space,
  Steps,
  Table,
  Tabs,
  Tag,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  KeyOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { message } from "@/components/common/feedback";
import { formatDate, formatDateTime } from "@/lib/dates";
import { addressLine } from "@/lib/branch-info";
import {
  generateZatcaCsrAction,
  renewProductionCsidAction,
  requestComplianceCsidAction,
  requestProductionCsidAction,
  resetZatcaUnitAction,
  runComplianceChecksAction,
  saveZatcaUnitAction,
} from "@/actions/zatca.actions";
import { EnvTag, StatusTag, showZatcaError, stepOf } from "./zatcaUi";

const ENVIRONMENTS = ["developer", "simulation", "production"];

// نفس ترتيب السيرفر: الخانة 1 = ضريبية، الخانة 2 = مبسطة
function requiredDocs(invoiceType = "") {
  const kinds = [];
  if (invoiceType[0] === "1") kinds.push("standard");
  if (invoiceType[1] === "1") kinds.push("simplified");
  return kinds.flatMap((kind) =>
    ["invoice", "credit", "debit"].map((documentType) => ({
      kind,
      documentType,
    })),
  );
}
const INVOICE_TYPES = ["1100", "0100", "1000"];

// ============================================================
// تسجيل فرع مع الهيئة خطوة بخطوة:
// 0 البيانات → 1 CSR → 2 OTP (شهادة الامتثال) → 3 فحص الامتثال → 4 شهادة الإنتاج
// ============================================================
export default function ZatcaUnitWizard({
  branch,
  gatewayOnline,
  canSetup,
  onClose,
}) {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(null); // اسم العملية الجارية
  const [otp, setOtp] = useState("");
  const [renewOtp, setRenewOtp] = useState("");
  const [editData, setEditData] = useState(false);
  const locale = useLocale();
  const t = useTranslations("Zatca");
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);

  const unit = branch.unit;
  const step = stepOf(unit);
  const editable = !unit || ["draft", "csr"].includes(unit.status);
  const showData = step === 0 || (editData && editable);
  const environment = Form.useWatch("environment", form) ?? unit?.environment;
  const seller = branch.seller;
  const ready = gatewayOnline && canSetup;

  useEffect(() => {
    form.setFieldsValue(
      unit
        ? {
            environment: unit.environment,
            commonName: unit.commonName,
            organizationUnitName: unit.organizationUnitName,
            invoiceType: unit.invoiceType,
            locationAddress: unit.locationAddress,
            industry: unit.industry,
          }
        : {
            environment: "developer",
            commonName: `INFOTECH${branch.id}`,
            organizationUnitName: branch.arName,
            invoiceType: "1100",
            locationAddress: seller.address.city || "",
            industry: "",
          },
    );
  }, [form, unit, branch, seller]);

  // تنفيذ action وعرض النتيجة
  const run = async (name, action, input, successText) => {
    setBusy(name);
    const res = await action(input);
    setBusy(null);
    if (!res.success) {
      showZatcaError(res, { t, tAlerts, locale });
      return null;
    }
    if (successText) message.success(successText);
    return res.data;
  };

  const saveData = async (values) => {
    const data = await run(
      "save",
      saveZatcaUnitAction,
      { branchId: branch.id, ...values },
      tAlerts("SettingsSaved"),
    );
    if (data) setEditData(false);
  };

  const branchOnly = { branchId: branch.id };

  // ------------------------------------------------------------
  // بيانات البائع (من الشركة والفرع)
  // ------------------------------------------------------------
  const sellerBox = (
    <>
      <Descriptions
        size="small"
        bordered
        column={1}
        className="mb-3"
        items={[
          { key: "n", label: t("SellerName"), children: seller.name || "—" },
          {
            key: "v",
            label: t("VatNumber"),
            children: seller.vatNumber || "—",
          },
          { key: "c", label: t("Crn"), children: seller.idValue || "—" },
          {
            key: "a",
            label: t("NationalAddress"),
            children:
              addressLine(
                {
                  buildingNo: seller.address.buildingNumber,
                  street: seller.address.street,
                  district: seller.address.district,
                  city: seller.address.city,
                  postalCode: seller.address.postalCode,
                  additionalNo: seller.address.additionalNumber,
                },
                t("AdditionalNo"),
              ) || "—",
          },
        ]}
      />
      {branch.missing.length > 0 && (
        <Alert
          type="error"
          showIcon
          className="mb-3"
          title={t("MissingData")}
          description={
            <div>
              <ul style={{ margin: "4px 0", paddingInlineStart: 18 }}>
                {branch.missing.map((k) => (
                  <li key={k}>{t(`missing.${k}`)}</li>
                ))}
              </ul>
              <Space wrap>
                <Link href="/settings/company">{t("EditCompany")}</Link>
                <Link href="/branches">{t("EditBranch")}</Link>
              </Space>
            </div>
          }
        />
      )}
    </>
  );

  // ------------------------------------------------------------
  // الخطوة 0: بيانات الوحدة
  // ------------------------------------------------------------
  const dataStep = (
    <Form
      form={form}
      layout="vertical"
      onFinish={saveData}
      disabled={!canSetup || !editable}
    >
      {sellerBox}

      <Form.Item name="environment" label={t("Environment")} required>
        <Radio.Group optionType="button" buttonStyle="solid">
          {ENVIRONMENTS.map((e) => (
            <Radio.Button key={e} value={e}>
              {t(`env.${e}`)}
            </Radio.Button>
          ))}
        </Radio.Group>
      </Form.Item>
      {environment && (
        <Alert
          type={environment === "production" ? "warning" : "info"}
          showIcon
          className="mb-4"
          title={t(`envHint.${environment}`)}
        />
      )}

      <div className="zatca-grid">
        <Form.Item
          name="commonName"
          label={t("CommonName")}
          tooltip={t("CommonNameHint")}
          rules={[{ required: true, message: tAlerts("RequiredField") }]}
        >
          <Input maxLength={100} dir="ltr" />
        </Form.Item>
        <Form.Item
          name="organizationUnitName"
          label={t("OrganizationUnit")}
          tooltip={t("OrganizationUnitHint")}
          rules={[{ required: true, message: tAlerts("RequiredField") }]}
        >
          <Input maxLength={100} />
        </Form.Item>
        <Form.Item
          name="invoiceType"
          label={t("InvoiceTypes")}
          rules={[{ required: true, message: tAlerts("RequiredField") }]}
        >
          <Select
            options={INVOICE_TYPES.map((v) => ({
              value: v,
              label: t(`invoiceType.${v}`),
            }))}
          />
        </Form.Item>
        <Form.Item
          name="locationAddress"
          label={t("Location")}
          tooltip={t("LocationHint")}
          rules={[{ required: true, message: tAlerts("RequiredField") }]}
        >
          <Input maxLength={150} />
        </Form.Item>
        <Form.Item
          name="industry"
          label={t("Industry")}
          rules={[{ required: true, message: tAlerts("RequiredField") }]}
        >
          <Input maxLength={100} placeholder={t("IndustryPlaceholder")} />
        </Form.Item>
      </div>

      {canSetup && editable && (
        <Space>
          <Button
            type="primary"
            htmlType="submit"
            loading={busy === "save"}
            disabled={false}
          >
            {tButtons("Save")}
          </Button>
          {unit && editData && (
            <Button disabled={false} onClick={() => setEditData(false)}>
              {tButtons("Cancel")}
            </Button>
          )}
        </Space>
      )}
    </Form>
  );

  // ------------------------------------------------------------
  // ملخص الوحدة (فوق كل خطوة بعد البيانات)
  // ------------------------------------------------------------
  const summary = unit && (
    <Descriptions
      size="small"
      column={{ xs: 1, sm: 2 }}
      className="mb-4"
      items={[
        {
          key: "e",
          label: t("Environment"),
          children: <EnvTag env={unit.environment} t={t} />,
        },
        {
          key: "s",
          label: t("Status"),
          children: <StatusTag unit={unit} t={t} />,
        },
        { key: "cn", label: t("CommonName"), children: unit.commonName },
        {
          key: "it",
          label: t("InvoiceTypes"),
          children: t(`invoiceType.${unit.invoiceType}`),
        },
      ]}
    />
  );

  const editLink = editable && canSetup && (
    <Button type="link" onClick={() => setEditData(true)}>
      {t("EditData")}
    </Button>
  );

  // ------------------------------------------------------------
  // الخطوة 1: CSR
  // ------------------------------------------------------------
  const csrStep = (
    <>
      <Alert type="info" showIcon className="mb-4" title={t("CsrHint")} />
      {branch.missing.length > 0 && sellerBox}
      <Space wrap>
        <Button
          type="primary"
          icon={<KeyOutlined />}
          loading={busy === "csr"}
          disabled={!ready || branch.missing.length > 0}
          onClick={() =>
            run("csr", generateZatcaCsrAction, branchOnly, t("CsrDone"))
          }
        >
          {t("GenerateCsr")}
        </Button>
        {editLink}
      </Space>
    </>
  );

  // ------------------------------------------------------------
  // الخطوة 2: OTP → شهادة الامتثال
  // ------------------------------------------------------------
  const otpBox = (value, setValue, onSubmit, name, label) => (
    <Space.Compact style={{ maxWidth: 360, width: "100%" }}>
      <Input
        value={value}
        onChange={(e) =>
          setValue(e.target.value.replace(/\D/g, "").slice(0, 6))
        }
        placeholder="123456"
        maxLength={6}
        dir="ltr"
        inputMode="numeric"
        disabled={!ready}
        onPressEnter={onSubmit}
      />
      <Button
        type="primary"
        loading={busy === name}
        disabled={!ready || value.length !== 6}
        onClick={onSubmit}
      >
        {label}
      </Button>
    </Space.Compact>
  );

  const submitOtp = async () => {
    const data = await run(
      "otp",
      requestComplianceCsidAction,
      { branchId: branch.id, otp },
      t("ComplianceCsidDone"),
    );
    if (data) setOtp("");
  };

  const otpStep = (
    <>
      <Alert
        type="info"
        showIcon
        className="mb-4"
        title={t("OtpTitle")}
        description={t(`otpHint.${unit?.environment ?? "developer"}`)}
      />
      {otpBox(otp, setOtp, submitOtp, "otp", t("RequestComplianceCsid"))}
      <div className="mt-3">{editLink}</div>
    </>
  );

  // ------------------------------------------------------------
  // الخطوة 3: فحص الامتثال
  // ------------------------------------------------------------
  const checks = unit?.complianceChecks;
  // المستندات المطلوبة حسب نوع الفواتير (لحد 6: ضريبية ومبسطة × فاتورة / دائن / مدين)
  // مع نتيجة آخر فحص لكل واحد
  const checkRows = requiredDocs(unit?.invoiceType).map(
    (doc) =>
      checks?.results?.find(
        (r) => r.kind === doc.kind && r.documentType === doc.documentType,
      ) ?? { ...doc, pending: true, errors: [], warnings: [] },
  );
  const checksTable = checkRows.length > 0 && (
    <Table
      size="small"
      rowKey={(r) => `${r.kind}-${r.documentType}`}
      pagination={false}
      className="mt-4"
      title={() => t("RequiredDocs", { count: checkRows.length })}
      dataSource={checkRows}
      columns={[
        {
          title: t("Document"),
          key: "doc",
          render: (_, r) =>
            `${t(`kind.${r.kind}`)} — ${t(`docType.${r.documentType}`)}`,
        },
        {
          title: t("Result"),
          key: "res",
          render: (_, r) =>
            r.pending ? (
              <Tag>{t("NotRunYet")}</Tag>
            ) : r.accepted ? (
              <Tag icon={<CheckCircleOutlined />} color="success">
                {r.status}
              </Tag>
            ) : (
              <Tag icon={<CloseCircleOutlined />} color="error">
                {r.status || t("Failed")}
              </Tag>
            ),
        },
        {
          title: t("Messages"),
          key: "msg",
          render: (_, r) => {
            const items = [
              ...r.errors.map((m) => ({ ...m, type: "error" })),
              ...r.warnings.map((m) => ({ ...m, type: "warning" })),
            ];
            if (!items.length) return "—";
            return (
              <ul className="zatca-msgs">
                {items.map((m, i) => (
                  <li key={i} className={`zatca-msg zatca-msg--${m.type}`}>
                    {[m.code, m.message].filter(Boolean).join(": ")}
                  </li>
                ))}
              </ul>
            );
          },
        },
      ]}
    />
  );

  const runChecks = async () => {
    const data = await run("checks", runComplianceChecksAction, branchOnly);
    if (data) {
      if (data.passed) message.success(t("ChecksPassed"));
      else message.error(t("ChecksFailed"));
    }
  };

  const checksStep = (
    <>
      <Alert type="info" showIcon className="mb-4" title={t("ChecksHint")} />
      <Space wrap>
        <Button
          type="primary"
          icon={<SendOutlined />}
          loading={busy === "checks"}
          disabled={!ready}
          onClick={runChecks}
        >
          {checks ? t("RerunChecks") : t("RunChecks")}
        </Button>
        {checks?.at && (
          <span className="zatca-muted">
            {t("LastRun")}: {formatDateTime(checks.at)}
          </span>
        )}
      </Space>
      {checksTable}
    </>
  );

  // ------------------------------------------------------------
  // الخطوة 4: شهادة الإنتاج
  // ------------------------------------------------------------
  const productionStep = (
    <>
      <Alert
        type="success"
        showIcon
        className="mb-4"
        title={t("ChecksPassed")}
        description={t("ProductionHint")}
      />
      <Button
        type="primary"
        icon={<SafetyCertificateOutlined />}
        loading={busy === "production"}
        disabled={!ready}
        onClick={() =>
          run(
            "production",
            requestProductionCsidAction,
            branchOnly,
            t("ProductionDone"),
          )
        }
      >
        {t("RequestProductionCsid")}
      </Button>
      {checksTable}
    </>
  );

  // ------------------------------------------------------------
  // تم: الوحدة جاهزة
  // ------------------------------------------------------------
  const submitRenew = async () => {
    const data = await run(
      "renew",
      renewProductionCsidAction,
      { branchId: branch.id, otp: renewOtp },
      t("RenewDone"),
    );
    if (data) setRenewOtp("");
  };

  const doneStep = unit && (
    <>
      <Result
        status="success"
        title={t("UnitActive")}
        subTitle={t(`activeHint.${unit.environment}`)}
        style={{ padding: "8px 0 16px" }}
      />
      <Descriptions
        size="small"
        bordered
        column={1}
        className="mb-4"
        items={[
          {
            key: "sn",
            label: t("CertSerial"),
            children: unit.certSerial || "—",
          },
          {
            key: "from",
            label: t("CertIssued"),
            children: unit.certIssuedAt ? formatDate(unit.certIssuedAt) : "—",
          },
          {
            key: "to",
            label: t("CertExpires"),
            children: unit.certExpiresAt ? (
              <Space size={6}>
                {formatDate(unit.certExpiresAt)}
                <Tag
                  color={
                    unit.certDaysRemaining < 0
                      ? "red"
                      : unit.certDaysRemaining <= 30
                        ? "orange"
                        : "green"
                  }
                >
                  {unit.certDaysRemaining < 0
                    ? t("Expired")
                    : t("DaysLeft", { days: unit.certDaysRemaining })}
                </Tag>
              </Space>
            ) : (
              "—"
            ),
          },
          {
            key: "on",
            label: t("OnboardedAt"),
            children: unit.onboardedAt ? formatDateTime(unit.onboardedAt) : "—",
          },
          { key: "icv", label: t("Icv"), children: unit.icv },
        ]}
      />
      {canSetup && (
        <>
          <h4 className="zatca-h4">
            <ReloadOutlined /> {t("RenewTitle")}
          </h4>
          <div className="zatca-muted mb-2">
            {t(`otpHint.${unit.environment}`)}
          </div>
          {otpBox(renewOtp, setRenewOtp, submitRenew, "renew", t("Renew"))}
        </>
      )}
    </>
  );

  const content = showData
    ? dataStep
    : [null, csrStep, otpStep, checksStep, productionStep, doneStep][step];

  // ------------------------------------------------------------
  // السجل
  // ------------------------------------------------------------
  const logs = (
    <Table
      size="small"
      rowKey="id"
      dataSource={unit?.logs ?? []}
      pagination={false}
      scroll={{ x: "max-content" }}
      columns={[
        {
          title: t("Date"),
          dataIndex: "createdAt",
          render: (v) => formatDateTime(v),
        },
        {
          title: t("Action"),
          dataIndex: "action",
          render: (v) => t(`logAction.${v}`),
        },
        {
          title: t("Environment"),
          dataIndex: "environment",
          render: (v) => <EnvTag env={v} t={t} />,
        },
        {
          title: t("Result"),
          dataIndex: "success",
          render: (v) =>
            v ? (
              <Tag color="success">{t("Success")}</Tag>
            ) : (
              <Tag color="error">{t("Failed")}</Tag>
            ),
        },
        {
          title: t("Details"),
          dataIndex: "message",
          render: (v) => <span className="zatca-log-msg">{v || "—"}</span>,
        },
        { title: t("User"), dataIndex: "userName", render: (v) => v || "—" },
      ]}
    />
  );

  return (
    <Modal
      open
      onCancel={onClose}
      footer={null}
      width={860}
      title={
        <Space wrap>
          <span>
            {t("Title")} — {nm(branch)}
          </span>
          <StatusTag unit={unit} t={t} />
        </Space>
      }
      destroyOnHidden
    >
      {!gatewayOnline && (
        <Alert
          type="error"
          showIcon
          className="mb-4"
          title={t("Offline")}
          description={t("OfflineHint")}
        />
      )}
      <Tabs
        items={[
          {
            key: "steps",
            label: t("Steps"),
            children: (
              <>
                <Steps
                  size="small"
                  className="mb-6"
                  current={Math.min(step, 4)}
                  status={step === 5 ? "finish" : "process"}
                  items={[
                    { title: t("step.data") },
                    { title: t("step.csr") },
                    { title: t("step.otp") },
                    { title: t("step.checks") },
                    { title: t("step.production") },
                  ]}
                />
                {!showData && summary}
                {content}

                {unit && canSetup && unit.status !== "draft" && (
                  <div className="zatca-reset">
                    <Popconfirm
                      title={t("ResetConfirm")}
                      description={t("ResetConfirmText")}
                      okButtonProps={{ danger: true }}
                      onConfirm={() =>
                        run(
                          "reset",
                          resetZatcaUnitAction,
                          branchOnly,
                          t("ResetDone"),
                        )
                      }
                    >
                      <Button danger type="link" loading={busy === "reset"}>
                        {t("Reset")}
                      </Button>
                    </Popconfirm>
                    <span className="zatca-muted">{t("ResetHint")}</span>
                  </div>
                )}
              </>
            ),
          },
          {
            key: "logs",
            label: t("Log"),
            disabled: !unit,
            children: logs,
          },
        ]}
      />
    </Modal>
  );
}
