"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  AutoComplete,
  Button,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import {
  ApiOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  PrinterOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCan } from "@/components/auth/AuthProvider";
import {
  deletePrinterAction,
  savePrinterAction,
} from "@/actions/restaurant-printer.actions";
import { C } from "@/lib/theme";
import EntityModal from "./EntityModal";
import PrintAgentCard from "./PrintAgentCard";
import { agentCommandAction } from "@/actions/print-agent.actions";

// ============================================================
// الطباعة: طابعات كل فرع وتوزيع التحضير عليها
// - الكاشير: الفاتورة | التحضير: كل طابعة أقسامها وأصنافها الخاصة
// - الصنف: طابعاته الخاصة ← طابعات قسمه ← الطابعة الافتراضية
// - التوصيل: شبكة (IP) / ويندوز (بالاسم) / المتصفح
//   (الشبكة والويندوز بيشتغلوا مع وسيط الطباعة، ولحد ما يشتغل كله من المتصفح)
// ============================================================
export default function RestaurantPrintersTab({
  printers,
  agents = [],
  branches,
  categories,
  items,
}) {
  const t = useTranslations("Restaurant");
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");
  const locale = useLocale();
  const can = useCan();
  const canManage = can("restaurant.manage");
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? null);
  const [editing, setEditing] = useState(null);

  const catName = useMemo(
    () => new Map(categories.map((c) => [c.id, nm(c)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories, locale],
  );
  const itemName = useMemo(
    () => new Map(items.map((i) => [i.productId, nm(i.product)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, locale],
  );
  const rows = printers.filter((p) => !branchId || p.branchId === branchId);
  // أقسام المنيو اللي مالهاش طابعة تحضير في الفرع ده (هتطلع على الافتراضية)
  const menuCats = [...new Set(items.map((i) => i.product.categoryId))];
  const covered = new Set(
    rows
      .filter((p) => p.kind === "kitchen" && p.isActive)
      .flatMap((p) => p.categoryIds),
  );
  const uncovered = menuCats.filter((id) => !covered.has(id));
  const hasDefault = rows.some((p) => p.kind === "kitchen" && p.isDefault && p.isActive);

  const remove = async (p) => {
    const res = await deletePrinterAction(p.id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Deleted"));
  };

  const connText = (p) =>
    p.connection === "network" ? (
      <bdi dir="ltr">
        {p.host}:{p.port}
      </bdi>
    ) : p.connection === "windows" ? (
      <span>{p.windowsName}</span>
    ) : (
      <span>{t("conn.browser")}</span>
    );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <Space wrap>
          {branches.length > 1 && (
            <Select
              style={{ minWidth: 200 }}
              value={branchId}
              onChange={setBranchId}
              options={branches.map((b) => ({ value: b.id, label: nm(b) }))}
            />
          )}
          <span style={{ color: C.muted, fontSize: 13 }}>{t("PrintersHint")}</span>
        </Space>
        {canManage && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!branchId}
            onClick={() => setEditing({ branchId })}
          >
            {t("NewPrinter")}
          </Button>
        )}
      </div>

      {branchId && (
        <PrintAgentCard branchId={branchId} agents={agents} canManage={canManage} />
      )}
      {uncovered.length > 0 && (
        <Alert
          type={hasDefault ? "info" : "warning"}
          showIcon
          className="mb-3"
          title={
            hasDefault
              ? t("UncoveredToDefault", {
                  list: uncovered.map((id) => catName.get(id)).join("، "),
                })
              : t("UncoveredNoDefault", {
                  list: uncovered.map((id) => catName.get(id)).join("، "),
                })
          }
        />
      )}

      <Table
        rowKey="id"
        size="small"
        dataSource={rows}
        pagination={false}
        scroll={{ x: 820 }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t("NoPrinters")}
            />
          ),
        }}
        columns={[
          {
            title: t("PrinterName"),
            render: (_, p) => (
              <Space size={4} wrap>
                <b>{p.name}</b>
                {p.isDefault && <Tag color="green">{t("DefaultPrinter")}</Tag>}
              </Space>
            ),
          },
          {
            title: t("PrinterKind"),
            dataIndex: "kind",
            width: 110,
            render: (v) => (
              <Tag color={v === "cashier" ? "geekblue" : "orange"}>
                {t(`printerKind.${v}`)}
              </Tag>
            ),
          },
          {
            title: t("Connection"),
            width: 180,
            render: (_, p) => (
              <span>
                <div style={{ color: C.muted, fontSize: 12 }}>
                  {t(`conn.${p.connection}`)}
                </div>
                {connText(p)}
              </span>
            ),
          },
          {
            title: t("PrintsWhat"),
            render: (_, p) =>
              p.kind === "cashier" ? (
                <span style={{ color: C.muted }}>{t("PrintsInvoice")}</span>
              ) : p.categoryIds.length || p.productIds.length ? (
                <Space size={[4, 4]} wrap>
                  {p.categoryIds.map((id) => (
                    <Tag key={`c${id}`}>{catName.get(id) ?? id}</Tag>
                  ))}
                  {p.productIds.map((id) => (
                    <Tag key={`p${id}`} color="purple">
                      {itemName.get(id) ?? id}
                    </Tag>
                  ))}
                </Space>
              ) : (
                <span style={{ color: C.muted }}>
                  {p.isDefault ? t("PrintsRest") : "—"}
                </span>
              ),
          },
          {
            title: t("Paper"),
            dataIndex: "paperSize",
            width: 80,
          },
          {
            title: t("PriorityCol"),
            dataIndex: "priority",
            width: 80,
          },
          {
            title: t("Status"),
            dataIndex: "isActive",
            width: 90,
            render: (v) =>
              v ? <Tag color="green">{t("Active")}</Tag> : <Tag>{t("Inactive")}</Tag>,
          },
          ...(canManage
            ? [
                {
                  title: "",
                  width: 90,
                  render: (_, p) => (
                    <Space size={0}>
                      <Button
                        size="small"
                        type="text"
                        icon={<EditOutlined />}
                        title={tButtons("Edit")}
                        onClick={() => setEditing(p)}
                      />
                      <Popconfirm
                        title={t("ConfirmDeletePrinter")}
                        okButtonProps={{ danger: true }}
                        onConfirm={() => remove(p)}
                      >
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          title={tButtons("Delete")}
                        />
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />

      {editing && (
        <EntityModal
          width={860}
          title={editing.id ? t("EditPrinter") : t("NewPrinter")}
          initialValues={{
            branchId: editing.branchId,
            name: editing.name ?? "",
            kind: editing.kind ?? "kitchen",
            connection: editing.connection ?? "network",
            host: editing.host ?? "",
            port: editing.port ?? 9100,
            windowsName: editing.windowsName ?? "",
            paperSize: editing.paperSize ?? "80mm",
            copies: editing.copies ?? 1,
            isDefault: editing.isDefault ?? false,
            isActive: editing.isActive ?? true,
            priority: editing.priority ?? 0,
            autoCut: editing.autoCut ?? true,
            beep: editing.beep ?? false,
            fullTicket: editing.fullTicket ?? false,
            categoryIds: editing.categoryIds ?? [],
            productIds: editing.productIds ?? [],
          }}
          save={(v) =>
            savePrinterAction({
              ...v,
              id: editing.id ?? null,
              host: v.host || null,
              windowsName: v.windowsName || null,
              port: v.port ?? 9100,
              copies: v.copies ?? 1,
              priority: v.priority ?? 0,
              autoCut: Boolean(v.autoCut),
              beep: Boolean(v.beep),
              fullTicket: Boolean(v.fullTicket),
              isDefault: Boolean(v.isDefault),
              categoryIds: v.categoryIds ?? [],
              productIds: v.productIds ?? [],
            })
          }
          onClose={() => setEditing(null)}
        >
          <PrinterFields
            branches={branches}
            categories={categories}
            items={items}
            nm={nm}
            agents={agents}
          />
        </EntityModal>
      )}
    </>
  );
}

function PrinterFields({ branches, categories, items, nm, agents }) {
  const t = useTranslations("Restaurant");
  const tA = useTranslations("PrintAgent");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const form = Form.useFormInstance();
  const kind = Form.useWatch("kind");
  const connection = Form.useWatch("connection");
  const branchId = Form.useWatch("branchId");
  const [busy, setBusy] = useState(null);
  const [found, setFound] = useState(null);
  const req = [{ required: true, whitespace: true, message: tAlerts("RequiredField") }];

  // طابعات ويندوز المتسطبة على أجهزة الفرع (الوسيط بيبعتها)
  const branchAgents = agents.filter((a) => a.branchId === branchId && a.isActive);
  const agentOnline = branchAgents.some((a) => a.online);
  const winPrinters = [...new Set(branchAgents.flatMap((a) => a.winPrinters))];

  // أوامر الوسيط: اختبار الاتصال / طباعة تجربة / بحث
  const run = async (cmd) => {
    const v = form.getFieldsValue();
    setBusy(cmd);
    const res = await agentCommandAction({
      branchId: v.branchId,
      kind: cmd,
      connection: v.connection === "browser" ? null : v.connection,
      host: v.connection === "network" ? v.host || null : null,
      port: v.port ?? 9100,
      windowsName: v.connection === "windows" ? v.windowsName || null : null,
      paperSize: v.paperSize,
    });
    setBusy(null);
    if (!res.success) return showActionError(res, tAlerts, locale);
    const r = res.data;
    if (!r.ok) return message.error(tA("CommandFailed", { error: r.error ?? "" }));
    if (cmd === "probe") message.success(tA("ProbeOk", { ms: r.result?.ms ?? 0 }));
    else if (cmd === "test") message.success(tA("TestSent"));
    else setFound(r.result?.found ?? []);
  };

  return (
    <Row gutter={12}>
      {/* 1) نوع التوصيل الأول */}
      <Col xs={24} md={8}>
        <Form.Item name="connection" label={t("Connection")} tooltip={t("ConnectionHint")}>
          <Select
            options={["network", "windows", "browser"].map((v) => ({
              value: v,
              label: t(`conn.${v}`),
            }))}
          />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item name="name" label={t("PrinterName")} rules={req}>
          <Input autoComplete="off" placeholder={t("PrinterNameHint")} />
        </Form.Item>
      </Col>
      <Col xs={12} md={4}>
        <Form.Item name="kind" label={t("PrinterKind")}>
          <Select
            options={["kitchen", "cashier"].map((v) => ({
              value: v,
              label: t(`printerKind.${v}`),
            }))}
          />
        </Form.Item>
      </Col>
      <Col xs={12} md={4}>
        <Form.Item name="branchId" label={t("Branch")}>
          <Select options={branches.map((b) => ({ value: b.id, label: nm(b) }))} />
        </Form.Item>
      </Col>

      {/* 2) بيانات التوصيل + الاختبار */}
      {connection !== "browser" && !agentOnline && (
        <Col xs={24}>
          <Alert type="warning" showIcon className="mb-3" title={tA("NeedAgent")} />
        </Col>
      )}
      {connection === "network" && (
        <>
          <Col xs={12} md={8}>
            <Form.Item name="host" label={t("PrinterIp")} rules={req}>
              <Input dir="ltr" autoComplete="off" placeholder="192.168.1.50" />
            </Form.Item>
          </Col>
          <Col xs={12} md={4}>
            <Form.Item name="port" label={t("PrinterPort")} tooltip={t("PrinterPortHint")}>
              <InputNumber min={1} max={65535} precision={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label=" " colon={false}>
              <Space wrap>
                <Button
                  icon={<ApiOutlined />}
                  loading={busy === "probe"}
                  disabled={!agentOnline || Boolean(busy)}
                  onClick={() => run("probe")}
                >
                  {tA("Probe")}
                </Button>
                <Button
                  icon={<SearchOutlined />}
                  loading={busy === "scan"}
                  disabled={!agentOnline || Boolean(busy)}
                  onClick={() => run("scan")}
                >
                  {tA("Scan")}
                </Button>
                <Button
                  icon={<PrinterOutlined />}
                  loading={busy === "test"}
                  disabled={!agentOnline || Boolean(busy)}
                  onClick={() => run("test")}
                >
                  {tA("TestPrint")}
                </Button>
              </Space>
            </Form.Item>
          </Col>
          {found && (
            <Col xs={24}>
              <div className="print-agent-found">
                {found.length ? (
                  <>
                    <span>{tA("FoundN", { n: found.length })}</span>
                    {found.map((f) => (
                      <Button
                        key={f.host}
                        size="small"
                        onClick={() => {
                          form.setFieldsValue({ host: f.host, port: f.port });
                          setFound(null);
                        }}
                      >
                        <bdi dir="ltr">{f.host}</bdi>
                      </Button>
                    ))}
                  </>
                ) : (
                  <span>{tA("FoundNone")}</span>
                )}
              </div>
            </Col>
          )}
        </>
      )}
      {connection === "windows" && (
        <>
          <Col xs={24} md={14}>
            <Form.Item
              name="windowsName"
              label={t("WindowsName")}
              tooltip={t("WindowsNameHint")}
              rules={req}
            >
              {/* القائمة من الوسيط، وينفع تكتب الاسم لو الجهاز مش متصل دلوقتي */}
              <AutoComplete
                options={winPrinters.map((p) => ({ value: p }))}
                placeholder={winPrinters.length ? tA("ChoosePrinter") : tA("NoWinPrinters")}
                filterOption={(input, o) =>
                  String(o?.value ?? "").toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={10}>
            <Form.Item label=" " colon={false}>
              <Button
                icon={<PrinterOutlined />}
                loading={busy === "test"}
                disabled={!agentOnline || Boolean(busy)}
                onClick={() => run("test")}
              >
                {tA("TestPrint")}
              </Button>
            </Form.Item>
          </Col>
        </>
      )}

      {/* 3) الورق والنسخ والأولوية والقص والصوت */}
      <Col xs={8} md={4}>
        <Form.Item name="paperSize" label={t("Paper")}>
          <Select options={["80mm", "58mm"].map((v) => ({ value: v, label: v }))} />
        </Form.Item>
      </Col>
      <Col xs={8} md={4}>
        <Form.Item name="copies" label={t("Copies")}>
          <InputNumber min={1} max={5} precision={0} style={{ width: "100%" }} />
        </Form.Item>
      </Col>
      <Col xs={8} md={4}>
        <Form.Item name="priority" label={tA("Priority")} tooltip={tA("PriorityHint")}>
          <InputNumber min={0} max={99} precision={0} style={{ width: "100%" }} />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <div className="print-agent-switches">
          <Form.Item name="isActive" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
          <span>{t("Active")}</span>
          <Form.Item name="autoCut" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
          <span>{tA("AutoCut")}</span>
          <Form.Item name="beep" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
          <span title={tA("BeepHint")}>{tA("Beep")}</span>
          {kind === "kitchen" ? (
            <>
              <Form.Item name="isDefault" valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
              <span title={t("DefaultPrinterHint")}>{t("DefaultPrinter")}</span>
            </>
          ) : (
            <>
              <Form.Item name="fullTicket" valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
              <span title={tA("FullTicketHint")}>{tA("FullTicket")}</span>
            </>
          )}
        </div>
      </Col>

      {/* 4) التحضير: الأقسام والأصناف */}
      {kind === "kitchen" && (
        <>
          <Col xs={24} md={12}>
            <Form.Item
              name="categoryIds"
              label={t("PrinterCategories")}
              tooltip={t("PrinterCategoriesHint")}
            >
              <Select
                mode="multiple"
                allowClear
                optionFilterProp="label"
                options={categories.map((c) => ({ value: c.id, label: nm(c) }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="productIds"
              label={t("PrinterItems")}
              tooltip={t("PrinterItemsHint")}
            >
              <Select
                mode="multiple"
                allowClear
                optionFilterProp="label"
                options={items.map((i) => ({
                  value: i.productId,
                  label: nm(i.product),
                }))}
              />
            </Form.Item>
          </Col>
        </>
      )}
    </Row>
  );
}
