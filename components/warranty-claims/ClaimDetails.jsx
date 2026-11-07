"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Steps,
  Table,
  Tag,
} from "antd";
import {
  CarOutlined,
  CheckCircleOutlined,
  InboxOutlined,
  RollbackOutlined,
  SearchOutlined,
  SmileOutlined,
  DeleteOutlined,
  EditOutlined,
  FileAddOutlined,
  PrinterOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import PrintDocument from "@/components/printing/PrintDocument";
import ProductPicker from "@/components/purchases/ProductPicker";
import ScanSafeNumber from "@/components/common/ScanSafeNumber";
import WarrantyCertificate from "@/components/serials/WarrantyCertificate";
import WarrantyBadge from "@/components/serials/WarrantyBadge";
import { useCan } from "@/components/auth/AuthProvider";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import QuickAddParty from "@/components/parties/QuickAddParty";
import { Link, useRouter } from "@/i18n/routing";
import { formatDate, formatDateTime } from "@/lib/dates";
import { saleDocNo } from "@/lib/doc-number";
import {
  changeClaimStatusAction,
  searchClaimProductsAction,
  setClaimItemsAction,
} from "@/actions/warranty-claim.actions";
import { ClaimStatusTag } from "./ClaimStatusTag";
import { CLAIM_COLORS } from "./claimColors";
import "./claims.css";
import ClaimEditModal from "./ClaimEditModal";
import { C } from "@/lib/theme";

const FLOW = [
  "received",
  "inspecting",
  "at_agent",
  "back",
  "ready",
  "delivered",
];
let seq = 0;
// أيقونة كل مرحلة
const FLOW_ICONS = {
  received: InboxOutlined,
  inspecting: SearchOutlined,
  at_agent: CarOutlined,
  back: RollbackOutlined,
  ready: CheckCircleOutlined,
  delivered: SmileOutlined,
};

// ============================================================
// تفاصيل طلب الضمان / الصيانة: المراحل، القطع والمصنعية، الفاتورة، السجل
// ============================================================
export default function ClaimDetails({
  claim: c,
  suppliers = [],
  receiptPaper = "80mm",
  autoPrint = false,
}) {
  const t = useTranslations("Claims");
  const tSerial = useTranslations("Serials");
  const tExports = useTranslations("Exports");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const router = useRouter();
  const can = useCan();
  const { amount: money } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [printing, setPrinting] = useState(autoPrint ? receiptPaper : false);
  const [action, setAction] = useState(null); // المرحلة اللي بتتنقل لها
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const open = !["delivered", "cancelled"].includes(c.status);
  const canUpdate = can("warrantyClaims.update");
  const customerName = nm(c.customer) || c.customerName;
  const phone = c.customerPhone || c.customer?.phone;
  const device = nm(c.product) || c.deviceName;

  const move = async (status, values = {}) => {
    setBusy(true);
    const res = await changeClaimStatusAction({ id: c.id, status, ...values });
    setBusy(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Moved", { status: t(`Status_${status}`) }));
    setAction(null);
  };

  // المراحل اللي ليها نافذة (بيانات)، والباقي تأكيد بس
  const needsForm = (s) => ["at_agent", "back"].includes(s);

  // إيصال الاستلام (كاشير / A4)
  const accessories = [
    ...(c.accessories ?? []).map((a) => t(`Acc_${a}`)),
    ...(c.accessoriesOther ? [c.accessoriesOther] : []),
  ];
  const receiptRows = [
    [t("Number"), `WC-${c.number}`],
    [t("Date"), formatDateTime(c.createdAt)],
    [t("Customer"), customerName],
    ...(phone ? [[t("Phone"), phone]] : []),
    [t("Device"), device],
    ...(c.serialText
      ? [
          [
            tSerial("DefaultLabel1"),
            c.serial2Text ? `${c.serialText} / ${c.serial2Text}` : c.serialText,
          ],
        ]
      : []),
    [t("Kind"), t(`Kind_${c.kind}`)],
    ...(c.warrantyEndsAt ? [[tSerial("WarrantyEnds"), c.warrantyEndsAt]] : []),
    [t("Fault"), c.fault],
    [t("Accessories"), accessories.length ? accessories.join("، ") : "—"],
    ...(c.condition ? [[t("Condition"), c.condition]] : []),
    ...(c.expectedAt ? [[t("ExpectedAt"), c.expectedAt]] : []),
    ...(c.kind === "paid" && c.estimate != null
      ? [[t("Estimate"), money(c.estimate)]]
      : []),
  ];

  const stepIndex = c.status === "cancelled" ? -1 : FLOW.indexOf(c.status);

  return (
    <>
      <PageHeader
        title={
          <Space wrap>
            <span>
              {t("Claim")} <bdi>WC-{c.number}</bdi>
            </span>
            <ClaimStatusTag status={c.status} />
            <Tag color={c.kind === "warranty" ? "green" : "gold"}>
              {t(`Kind_${c.kind}`)}
            </Tag>
          </Space>
        }
        extra={
          <Space wrap>
            <Button
              icon={<PrinterOutlined />}
              onClick={() => setPrinting(receiptPaper)}
            >
              {t("PrintReceipt")}
            </Button>
            <Button
              icon={<PrinterOutlined />}
              onClick={() => setPrinting("A4")}
            >
              {t("PrintReceiptA4")}
            </Button>
            {open && canUpdate && (
              <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
                {t("Edit")}
              </Button>
            )}
          </Space>
        }
      />

      {c.status === "cancelled" ? (
        <Alert
          type="error"
          showIcon
          className="mb-3"
          title={t("CancelledNote")}
        />
      ) : (
        // شريط المراحل: خلفية بلون المرحلة الحالية، واللي خلص أخضر
        <div
          className="claim-flow mb-3"
          style={{ "--c": CLAIM_COLORS[c.status] }}
        >
          <Steps
            size="small"
            current={stepIndex}
            items={FLOW.map((s, i) => {
              const Icon = FLOW_ICONS[s];
              const state =
                i < stepIndex ? "is-done" : i === stepIndex ? "is-current" : "";
              return {
                title: (
                  <span
                    style={{
                      fontWeight: i === stepIndex ? 800 : 500,
                      color: i === stepIndex ? CLAIM_COLORS[s] : undefined,
                    }}
                  >
                    {t(`Status_${s}`)}
                  </span>
                ),
                icon: (
                  <span
                    className={`claim-flow__icon ${state}`}
                    style={{ "--c": CLAIM_COLORS[s] }}
                  >
                    <Icon />
                  </span>
                ),
              };
            })}
          />
        </div>
      )}

      {/* ---------- الإجراءات ---------- */}
      {open && (
        <Card size="small" className="mb-3" title={t("Actions")}>
          <Space wrap>
            {c.next
              .filter((s) =>
                s === "delivered"
                  ? can("warrantyClaims.deliver")
                  : s === "cancelled"
                    ? can("warrantyClaims.cancel")
                    : canUpdate,
              )
              .map((s) =>
                needsForm(s) ? (
                  <Button
                    key={s}
                    type="primary"
                    ghost={s !== "back"}
                    onClick={() => setAction(s)}
                  >
                    {t(`Do_${s}`)}
                  </Button>
                ) : (
                  <Popconfirm
                    key={s}
                    title={t(`Confirm_${s}`)}
                    onConfirm={() => move(s)}
                  >
                    <Button
                      type={s === "delivered" ? "primary" : "default"}
                      danger={s === "cancelled"}
                      loading={busy}
                    >
                      {t(`Do_${s}`)}
                    </Button>
                  </Popconfirm>
                ),
              )}
          </Space>
          {c.kind === "paid" && c.items.length > 0 && !c.sale && (
            <div style={{ color: C.muted, fontSize: 12 }} className="mt-2">
              {t("InvoiceBeforeDelivery")}
            </div>
          )}
        </Card>
      )}

      {/* ---------- البيانات ---------- */}
      <Card size="small" className="mb-3">
        <Descriptions
          size="small"
          bordered
          column={{ xs: 1, sm: 2, lg: 3 }}
          items={[
            { key: "c", label: t("Customer"), children: customerName },
            ...(phone
              ? [{ key: "p", label: t("Phone"), children: <bdi>{phone}</bdi> }]
              : []),
            { key: "d", label: t("Device"), children: <b>{device}</b> },
            ...(c.serialText
              ? [
                  {
                    key: "s",
                    label: tSerial("DefaultLabel1"),
                    children: (
                      <Link
                        href={`/serials?q=${encodeURIComponent(c.serialText)}`}
                      >
                        <bdi>
                          {c.serial2Text
                            ? `${c.serialText} / ${c.serial2Text}`
                            : c.serialText}
                        </bdi>
                      </Link>
                    ),
                  },
                ]
              : []),
            ...(c.serial?.saleItem?.sale
              ? [
                  {
                    key: "inv",
                    label: t("SoldBy"),
                    children: (
                      <Link
                        href={`/invoices/sales/${c.serial.saleItem.sale.id}`}
                      >
                        <bdi>
                          {saleDocNo("sale", c.serial.saleItem.sale.number)}
                        </bdi>
                      </Link>
                    ),
                  },
                ]
              : []),
            ...(c.warrantyEndsAt
              ? [
                  {
                    key: "w",
                    label: tSerial("Warranty"),
                    children: <WarrantyBadge endsAt={c.warrantyEndsAt} />,
                  },
                ]
              : []),
            { key: "f", label: t("Fault"), children: c.fault },
            {
              key: "a",
              label: t("Accessories"),
              children: accessories.length ? accessories.join("، ") : "—",
            },
            ...(c.condition
              ? [{ key: "cd", label: t("Condition"), children: c.condition }]
              : []),
            ...(c.expectedAt
              ? [
                  {
                    key: "e",
                    label: t("ExpectedAt"),
                    children: <bdi>{c.expectedAt}</bdi>,
                  },
                ]
              : []),
            ...(c.kind === "paid" && c.estimate != null
              ? [
                  {
                    key: "es",
                    label: t("Estimate"),
                    children: money(c.estimate),
                  },
                ]
              : []),
            ...(c.supplier
              ? [
                  {
                    key: "ag",
                    label: t("Agent"),
                    children: (
                      <span>
                        {nm(c.supplier)}
                        {c.agentRef && (
                          <>
                            {" "}
                            — {t("AgentRef")}: <bdi>{c.agentRef}</bdi>
                          </>
                        )}
                        {c.sentAt && (
                          <>
                            {" "}
                            (<bdi>{formatDate(c.sentAt)}</bdi>)
                          </>
                        )}
                      </span>
                    ),
                  },
                ]
              : []),
            ...(c.result
              ? [
                  {
                    key: "r",
                    label: t("Result"),
                    children: (
                      <span>
                        <Tag color={c.result === "rejected" ? "red" : "green"}>
                          {t(`Result_${c.result}`)}
                        </Tag>
                        {c.newSerial && (
                          <>
                            {t("NewSerial")}:{" "}
                            <bdi>
                              {c.newSerial.serial2
                                ? `${c.newSerial.serial} / ${c.newSerial.serial2}`
                                : c.newSerial.serial}
                            </bdi>
                          </>
                        )}
                        {c.resultNote && <div>{c.resultNote}</div>}
                      </span>
                    ),
                  },
                ]
              : []),
            ...(c.notes
              ? [{ key: "n", label: t("Notes"), children: c.notes }]
              : []),
            {
              key: "by",
              label: t("ReceivedBy"),
              children: `${locale === "ar" ? c.createdBy.arFullname : c.createdBy.enFullname} — ${nm(c.branch)}`,
            },
          ]}
        />
      </Card>

      {/* ---------- القطع والمصنعية + الفاتورة ---------- */}
      <ClaimItems claim={c} editable={open && canUpdate && !c.sale} />

      {/* ---------- السجل ---------- */}
      <Card size="small" title={t("Log")}>
        <ol style={{ margin: 0, paddingInlineStart: 20 }}>
          {c.logs.map((l) => (
            <li key={l.id} style={{ marginBottom: 6 }}>
              <ClaimStatusTag status={l.status} />{" "}
              <bdi>{formatDateTime(l.createdAt)}</bdi> —{" "}
              {locale === "ar" ? l.user.arFullname : l.user.enFullname}
              {l.note && <span> — {l.note}</span>}
            </li>
          ))}
        </ol>
      </Card>

      {action && (
        <StatusModal
          status={action}
          claim={c}
          suppliers={suppliers}
          busy={busy}
          onClose={() => setAction(null)}
          onSubmit={(v) => move(action, v)}
        />
      )}
      {editing && (
        <ClaimEditModal claim={c} onClose={() => setEditing(false)} />
      )}

      {printing && (
        <PrintDocument
          paperSize={printing}
          margin={printing === "A4" ? 10 : 0}
          onDone={() => {
            setPrinting(false);
            // أول طباعة بعد الاستلام: نشيل ?print=1 من الرابط
            if (autoPrint) router.replace(`/warranty-claims/${c.id}`);
          }}
        >
          <WarrantyCertificate
            paper={printing}
            title={t("ReceiptTitle")}
            rows={receiptRows}
            signatures={[t("SignReceiver"), t("SignCustomer")]}
            labels={{
              taxNo: tSerial("TaxNo"),
              phone: tSerial("Phone"),
              printedAt: tExports("PrintedAt"),
            }}
          />
        </PrintDocument>
      )}
    </>
  );
}

// ---------- نافذة المرحلة: عند الوكيل / رجع ----------
function StatusModal({ status, claim, suppliers, busy, onClose, onSubmit }) {
  // الوكيل/المورد اللي اتضاف من الزر السريع
  const [added, setAdded] = useState([]);
  const agents = [
    ...suppliers,
    ...added.filter((a) => !suppliers.some((s) => s.id === a.id)),
  ];
  const t = useTranslations("Claims");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);
  const [form] = Form.useForm();
  const result = Form.useWatch("result", form);
  const req = [{ required: true, message: tAlerts("RequiredField") }];

  return (
    <Modal
      open
      title={t(`Do_${status}`)}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={busy}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        {status === "at_agent" && (
          <>
            <Form.Item label={t("Agent")}>
              <Space.Compact style={{ width: "100%" }}>
                <Form.Item name="supplierId" noStyle>
                  <Select
                    showSearch
                    allowClear
                    style={{ width: "100%" }}
                    optionFilterProp="label"
                    options={agents.map((s) => ({
                      value: s.id,
                      label: `${s.code} - ${nm(s)}`,
                    }))}
                  />
                </Form.Item>
                <QuickAddParty
                  kind="suppliers"
                  onCreated={(s) => {
                    setAdded((p) => [...p, s]);
                    form.setFieldValue("supplierId", s.id);
                  }}
                />
              </Space.Compact>
            </Form.Item>
            <Form.Item name="agentRef" label={t("AgentRef")}>
              <Input />
            </Form.Item>
          </>
        )}
        {status === "back" && (
          <>
            <Form.Item name="result" label={t("Result")} rules={req}>
              <Radio.Group
                optionType="button"
                buttonStyle="solid"
                options={["repaired", "replaced", "rejected"]
                  .filter((r) => r !== "replaced" || claim.serialId)
                  .map((r) => ({ value: r, label: t(`Result_${r}`) }))}
              />
            </Form.Item>
            {result === "replaced" && (
              <>
                <Form.Item name="newSerial" label={t("NewSerial")} rules={req}>
                  <Input autoFocus />
                </Form.Item>
                <Form.Item name="newSerial2" label={t("NewSerial2")}>
                  <Input />
                </Form.Item>
                <Alert
                  type="info"
                  showIcon
                  className="mb-3"
                  title={t("ReplaceNote")}
                />
              </>
            )}
            <Form.Item name="resultNote" label={t("ResultNote")}>
              <Input.TextArea rows={2} maxLength={500} />
            </Form.Item>
          </>
        )}
        {status !== "back" && (
          <Form.Item name="note" label={t("Note")}>
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

// ---------- القطع والمصنعية ← فاتورة الصيانة ----------
function ClaimItems({ claim: c, editable }) {
  const t = useTranslations("Claims");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const router = useRouter();
  const can = useCan();
  const { amount: money } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [rows, setRows] = useState(() =>
    c.items.map((i) => ({
      key: `i${++seq}`,
      productId: i.productId,
      code: i.product.code,
      arName: i.product.arName,
      enName: i.product.enName,
      units: [{ unit: i.unit, factor: 1 }],
      unitId: i.unitId,
      qty: i.qty,
      price: i.price,
    })),
  );
  const [saving, setSaving] = useState(false);
  const changed =
    JSON.stringify(rows.map((r) => [r.productId, r.unitId, r.qty, r.price])) !==
    JSON.stringify(c.items.map((i) => [i.productId, i.unitId, i.qty, i.price]));
  const total = rows.reduce(
    (s, r) => s + Number(r.qty || 0) * Number(r.price || 0),
    0,
  );

  const add = (product, unitId) => {
    const unit =
      product.units.find((u) => u.unit.id === unitId) ?? product.units[0];
    setRows((prev) => {
      const found = prev.find(
        (r) => r.productId === product.id && r.unitId === unit.unit.id,
      );
      if (found)
        return prev.map((r) =>
          r === found ? { ...r, qty: Number(r.qty) + 1 } : r,
        );
      return [
        ...prev,
        {
          key: `i${++seq}`,
          productId: product.id,
          code: product.code,
          arName: product.arName,
          enName: product.enName,
          units: product.units,
          unitId: unit.unit.id,
          qty: 1,
          price: unit.price,
        },
      ];
    });
  };
  const patch = (key, p) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const save = async () => {
    if (rows.some((r) => !(Number(r.qty) > 0)))
      return message.error(tAlerts("MustBePositive"));
    setSaving(true);
    const res = await setClaimItemsAction({
      id: c.id,
      items: rows.map((r) => ({
        productId: r.productId,
        unitId: r.unitId,
        qty: Number(r.qty),
        price: Number(r.price) || 0,
      })),
    });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("ItemsSaved"));
  };

  if (!editable && !rows.length && !c.sale) return null;

  return (
    <Card
      size="small"
      className="mb-3"
      title={t("Items")}
      extra={
        c.sale ? (
          <Link href={`/invoices/sales/${c.sale.id}`}>
            <Tag color="gold">
              {t("Invoice")} <bdi>{saleDocNo("sale", c.sale.number)}</bdi> —{" "}
              {money(c.sale.totalAmount)}
            </Tag>
          </Link>
        ) : (
          rows.length > 0 &&
          !changed &&
          can("sales.create") &&
          !["delivered", "cancelled"].includes(c.status) && (
            <Button
              type="primary"
              icon={<FileAddOutlined />}
              onClick={() => router.push(`/invoices/sales/new?claim=${c.id}`)}
            >
              {t("CreateInvoice")}
            </Button>
          )
        )
      }
    >
      {editable && (
        <div className="mb-3" style={{ maxWidth: 560 }}>
          <ProductPicker onAdd={add} searchAction={searchClaimProductsAction} />
          <div style={{ color: C.muted, fontSize: 12 }} className="mt-1">
            {t("ItemsHint")}
          </div>
        </div>
      )}
      <Table
        size="small"
        rowKey="key"
        pagination={false}
        dataSource={rows}
        scroll={{ x: 640 }}
        locale={{ emptyText: t("NoItems") }}
        columns={[
          {
            title: t("Item"),
            render: (_, r) => (
              <span>
                {nm(r)} <bdi style={{ color: C.muted }}>{r.code}</bdi>
              </span>
            ),
          },
          {
            title: t("Unit"),
            width: 120,
            render: (_, r) =>
              editable && r.units.length > 1 ? (
                <Select
                  size="small"
                  style={{ width: "100%" }}
                  value={r.unitId}
                  onChange={(v) => {
                    const u = r.units.find((x) => x.unit.id === v);
                    patch(r.key, { unitId: v, price: u?.price ?? r.price });
                  }}
                  options={r.units.map((u) => ({
                    value: u.unit.id,
                    label: nm(u.unit),
                  }))}
                />
              ) : (
                nm(r.units.find((u) => u.unit.id === r.unitId)?.unit)
              ),
          },
          {
            title: t("Qty"),
            width: 100,
            render: (_, r) =>
              editable ? (
                <ScanSafeNumber
                  field="qty"
                  size="small"
                  min={0}
                  precision={3}
                  value={r.qty}
                  onChange={(v) => patch(r.key, { qty: v ?? 0 })}
                  style={{ width: "100%" }}
                />
              ) : (
                r.qty
              ),
          },
          {
            title: t("Price"),
            width: 120,
            render: (_, r) =>
              editable ? (
                <InputNumber
                  size="small"
                  min={0}
                  value={r.price}
                  onChange={(v) => patch(r.key, { price: v ?? 0 })}
                  style={{ width: "100%" }}
                />
              ) : (
                money(r.price)
              ),
          },
          {
            title: t("Total"),
            width: 110,
            align: "end",
            render: (_, r) => money(Number(r.qty || 0) * Number(r.price || 0)),
          },
          ...(editable
            ? [
                {
                  title: "",
                  width: 50,
                  render: (_, r) => (
                    <Button
                      danger
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        setRows((prev) => prev.filter((x) => x.key !== r.key))
                      }
                    />
                  ),
                },
              ]
            : []),
        ]}
        summary={() =>
          rows.length ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={4}>
                <b>{t("Total")}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="end">
                <b>{money(total)}</b>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          ) : null
        }
      />
      {editable && (
        <Button
          type="primary"
          className="mt-3"
          icon={<SaveOutlined />}
          loading={saving}
          disabled={!changed}
          onClick={save}
        >
          {t("SaveItems")}
        </Button>
      )}
    </Card>
  );
}
