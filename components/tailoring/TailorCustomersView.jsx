"use client";

import { useState } from "react";
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ScissorOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import PageHeader from "@/components/common/PageHeader";
import SearchBox from "@/components/common/SearchBox";
import ClientOnly from "@/components/common/ClientOnly";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { formatDateTime } from "@/lib/dates";
import { KINSHIPS } from "@/lib/tailoring";
import {
  addMeasurementAction,
  createTailorCustomerAction,
  deleteMeasurementAction,
  deletePersonAction,
  getTailorCustomerAction,
  savePersonAction,
  searchTailorCustomersAction,
} from "@/actions/tailoring.actions";
import MeasuresGrid from "./MeasuresGrid";
import CustomerResults from "./CustomerResults";
import { C } from "@/lib/theme";

// ============================================================
// عملاء الخياط: البحث (الاسم / الجوال / الكود / اسم الشخص) ←
// العميل بأشخاصه (هو / ابنه ...) ولكل شخص سجل مقاساته (الأحدث الأول)
// - مقاس جديد بيتسجل جنب القديم (السجل بيفضل)
// - عميل جديد: بالجوال والاسم
// ============================================================
export default function TailorCustomersView({
  fields,
  initial,
  canManage,
  canOrder,
}) {
  const t = useTranslations("Tailoring");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const router = useRouter();
  const nameOf = (x) =>
    x ? (locale === "ar" ? x.arName : x.enName || x.arName) : "";
  const [search, setSearch] = useState("");
  const [results, setResults] = useState(null);
  const [customer, setCustomer] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [personEdit, setPersonEdit] = useState(null); // {} جديد | شخص
  const [measureFor, setMeasureFor] = useState(null); // { person, measures, notes }
  const [newCust, setNewCust] = useState(null); // { phone, customerName }
  const [busy, setBusy] = useState(false);
  const [personForm] = Form.useForm();

  const reload = async (id = customer?.id) => {
    if (!id) return;
    const res = await getTailorCustomerAction(id);
    if (res.success) setCustomer(res.data);
  };

  const find = async (value) => {
    const q = value.trim();
    if (!q) return;
    setLoading(true);
    try {
      const res = await searchTailorCustomersAction({ q });
      if (!res.success) return showActionError(res, tAlerts, locale);
      if (res.data.length === 1) {
        setResults(null);
        return reload(res.data[0].id);
      }
      setResults(res.data);
      // جوال مش موجود ← عميل جديد بنفس الجوال (والاسم لازم يتكتب)
      if (!res.data.length && /^\d{9,11}$/.test(q) && canManage) {
        message.info(t("CustomerNotFoundAdd"));
        setNewCust({ phone: q, customerName: "" });
      }
    } finally {
      setLoading(false);
    }
  };

  const newPhoneOk = /^\d{9,11}$/.test(newCust?.phone ?? "");
  const newNameOk = Boolean(newCust?.customerName?.trim());
  const createCustomer = async () => {
    if (!newNameOk || !newPhoneOk)
      return message.error(t("NewCustomerRequired"));
    setBusy(true);
    const res = await createTailorCustomerAction(newCust);
    setBusy(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    setNewCust(null);
    setResults(null);
    await reload(res.data);
  };

  const openPerson = (p) => {
    setPersonEdit(p ?? {});
    personForm.resetFields();
    personForm.setFieldsValue({
      name: p?.name ?? "",
      kinship: p?.kinship ?? (customer?.persons.length ? "son" : "self"),
      notes: p?.notes ?? "",
      isActive: p?.isActive ?? true,
    });
  };

  const savePerson = async (v) => {
    setBusy(true);
    const res = await savePersonAction({
      ...v,
      customerId: customer.id,
      ...(personEdit?.id ? { id: personEdit.id } : {}),
    });
    setBusy(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Saved"));
    setPersonEdit(null);
    reload();
  };

  const removePerson = async (id) => {
    const res = await deletePersonAction(id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Deleted"));
    reload();
  };

  const saveMeasure = async () => {
    setBusy(true);
    const res = await addMeasurementAction({
      personId: measureFor.person.id,
      measures: measureFor.measures,
      notes: measureFor.notes || null,
    });
    setBusy(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("MeasurementSaved"));
    setMeasureFor(null);
    reload();
  };

  const removeMeasure = async (id) => {
    const res = await deleteMeasurementAction(id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Deleted"));
    reload();
  };

  // جدول سجل المقاسات: عمود لكل خانة + التاريخ ومين أخدها
  const measureColumns = [
    {
      title: t("Date"),
      dataIndex: "createdAt",
      width: 140,
      fixed: "start",
      render: (v) => <bdi>{formatDateTime(v)}</bdi>,
    },
    ...fields.map((f) => ({
      title: nameOf(f),
      key: `f${f.id}`,
      width: 80,
      align: "center",
      render: (_, m) => <bdi>{m.measures[String(f.id)] ?? "—"}</bdi>,
    })),
    {
      title: t("TakenBy"),
      key: "by",
      width: 120,
      render: (_, m) =>
        nameOf({
          arName: m.takenBy?.arFullname,
          enName: m.takenBy?.enFullname,
        }) || "—",
    },
    {
      title: t("Notes"),
      dataIndex: "notes",
      width: 160,
      render: (v) => v || "—",
    },
    ...(canManage
      ? [
          {
            title: "",
            key: "a",
            width: 50,
            align: "center",
            render: (_, m) => (
              <Popconfirm
                title={t("DeleteConfirm")}
                onConfirm={() => removeMeasure(m.id)}
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader title={t("CustomersTitle")} />
      <Card size="small" className="mb-3">
        <Row gutter={[12, 8]} align="bottom">
          <Col xs={24} md={10}>
            <SearchBox
              placeholder={t("FindCustomer")}
              value={search}
              loading={loading}
              onChange={setSearch}
              onSearch={find}
            />
          </Col>
          {canManage && !newCust && (
            <Col xs={24} md={3}>
              <Button
                block
                type="primary"
                // زرار مليان (أخضر) عشان يبان جنب البحث
                style={{ background: C.success, borderColor: C.success }}
                icon={<UserAddOutlined />}
                onClick={() => {
                  setResults(null);
                  setNewCust({
                    phone: /^\d{9,11}$/.test(search.trim())
                      ? search.trim()
                      : "",
                    customerName: "",
                  });
                }}
              >
                {t("NewCustomer")}
              </Button>
            </Col>
          )}
          {newCust && (
            <>
              <Col xs={24} md={5}>
                <div className="text-xs text-slate-500 mb-1">
                  <span style={{ color: C.danger }}>* </span>
                  {t("NewCustomerName")}
                </div>
                <Input
                  autoComplete="off"
                  autoFocus
                  maxLength={255}
                  status={!newNameOk ? "error" : undefined}
                  value={newCust.customerName}
                  onChange={(e) =>
                    setNewCust((c) => ({ ...c, customerName: e.target.value }))
                  }
                />
              </Col>
              <Col xs={24} md={4}>
                <div className="text-xs text-slate-500 mb-1">
                  <span style={{ color: C.danger }}>* </span>
                  {t("Phone")}
                </div>
                <Input
                  dir="ltr"
                  autoComplete="off"
                  maxLength={11}
                  status={!newPhoneOk ? "error" : undefined}
                  value={newCust.phone}
                  onChange={(e) =>
                    setNewCust((c) => ({
                      ...c,
                      phone: e.target.value.replace(/\D/g, ""),
                    }))
                  }
                />
              </Col>
              <Col xs={24} md={5}>
                <Button
                  type="primary"
                  icon={<UserAddOutlined />}
                  loading={busy}
                  onClick={createCustomer}
                >
                  {t("AddCustomer")}
                </Button>
              </Col>
            </>
          )}
        </Row>
        {results && (
          <CustomerResults
            results={results}
            onPick={(id) => {
              setResults(null);
              reload(id);
            }}
          />
        )}
      </Card>

      {!customer ? (
        <Empty description={t("FindCustomerHint")} />
      ) : (
        <>
          <Card size="small" className="mb-3">
            <Space wrap size={16}>
              <span>
                <b>{nameOf(customer)}</b>{" "}
                <bdi className="text-slate-500">({customer.code})</bdi>
              </span>
              {customer.phone && <bdi>{customer.phone}</bdi>}
              <span className="flex-1" />
              {canManage && (
                <Button
                  icon={<PlusOutlined />}
                  onClick={() => openPerson(null)}
                >
                  {t("AddPerson")}
                </Button>
              )}
              {canOrder && (
                <Button
                  type="primary"
                  icon={<ScissorOutlined />}
                  onClick={() =>
                    router.push(`/tailoring/new?customer=${customer.id}`)
                  }
                >
                  {t("NewOrder")}
                </Button>
              )}
            </Space>
          </Card>

          {!customer.persons.length && <Empty description={t("NoPersons")} />}
          {customer.persons.map((p) => (
            <Card
              key={p.id}
              size="small"
              className="mb-3"
              title={
                <Space wrap>
                  <b>{p.name}</b>
                  <Tag className="cp-chip">{t(`kin_${p.kinship}`)}</Tag>
                  {!p.isActive && <Tag>{t("Inactive")}</Tag>}
                </Space>
              }
              extra={
                canManage && (
                  <Space>
                    <Button
                      size="small"
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() =>
                        setMeasureFor({
                          person: p,
                          measures: { ...(p.measurements[0]?.measures ?? {}) },
                          notes: "",
                        })
                      }
                    >
                      {t("NewMeasurement")}
                    </Button>
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => openPerson(p)}
                    />
                    <Popconfirm
                      title={t("DeletePersonConfirm")}
                      description={t("DeletePersonHint")}
                      onConfirm={() => removePerson(p.id)}
                    >
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                )
              }
            >
              {p.notes && <div className="mb-2 text-slate-500">{p.notes}</div>}
              <Table
                bordered
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={p.measurements}
                columns={measureColumns}
                scroll={{ x: measureColumns.reduce((s, c) => s + c.width, 0) }}
                locale={{ emptyText: t("NoMeasurements") }}
              />
            </Card>
          ))}
        </>
      )}

      <ClientOnly>
        <Modal
          open={Boolean(personEdit)}
          title={personEdit?.id ? t("EditPerson") : t("AddPerson")}
          onCancel={() => setPersonEdit(null)}
          onOk={() => personForm.submit()}
          confirmLoading={busy}
          width={560}
          forceRender
        >
          <Form
            form={personForm}
            layout="vertical"
            autoComplete="off"
            className="compact-modal-form"
            onFinish={savePerson}
          >
            <Row gutter={[12, 0]}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="name"
                  label={t("PersonName")}
                  rules={[
                    {
                      required: true,
                      whitespace: true,
                      message: tAlerts("RequiredField"),
                    },
                  ]}
                >
                  <Input maxLength={150} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={7}>
                <Form.Item name="kinship" label={t("Kinship")}>
                  <Select
                    options={KINSHIPS.map((k) => ({
                      value: k,
                      label: t(`kin_${k}`),
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} sm={5}>
                <Form.Item
                  name="isActive"
                  label={t("Active")}
                  valuePropName="checked"
                >
                  <Switch />
                </Form.Item>
              </Col>
              <Col xs={24}>
                <Form.Item name="notes" label={t("Notes")}>
                  <Input maxLength={500} />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Modal>

        <Modal
          open={Boolean(measureFor)}
          title={
            measureFor
              ? `${t("NewMeasurement")} - ${measureFor.person.name}`
              : ""
          }
          onCancel={() => setMeasureFor(null)}
          onOk={saveMeasure}
          confirmLoading={busy}
          width={900}
        >
          {measureFor && (
            <>
              <p className="text-slate-500 mb-3">{t("NewMeasurementHint")}</p>
              <MeasuresGrid
                fields={fields}
                value={measureFor.measures}
                onChange={(v) => setMeasureFor((m) => ({ ...m, measures: v }))}
              />
              <div className="text-xs text-slate-500 mb-1 mt-3">
                {t("Notes")}
              </div>
              <Input
                autoComplete="off"
                maxLength={500}
                value={measureFor.notes}
                onChange={(e) =>
                  setMeasureFor((m) => ({ ...m, notes: e.target.value }))
                }
              />
            </>
          )}
        </Modal>
      </ClientOnly>
    </div>
  );
}
