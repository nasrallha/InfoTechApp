"use client";

import { useState } from "react";
import { Card, Col, Empty, Row, Space, Statistic, Table, Tag } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import PageHeader from "@/components/common/PageHeader";
import SearchBox from "@/components/common/SearchBox";
import ExportButtons from "@/components/reports/ExportButtons";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { formatDate, formatDateTime, formatDay } from "@/lib/dates";
import { STATUS_COLOR, styleImageUrl } from "@/lib/tailoring";
import { C } from "@/lib/theme";
import { searchTailorCustomersAction } from "@/actions/tailoring.actions";
import CustomerResults from "./CustomerResults";
import CardActions from "./CardActions";
import "./tailoring.css";

// ============================================================
// تقرير العميل: البحث بالاسم / الجوال / الكود / اسم الشخص ←
// - بيانات العميل والإجماليات (الطلبات / الثياب / القيمة / المدفوع / المتبقي)
// - أشخاصه (هو / ابنه ...) بعدد طلباتهم وثيابهم وآخر مقاس
// - كل طلباته، ولكل طلب تفاصيله (الشخص / القماش / الثياب / التفاصيل / المقاسات)
// - تصدير Excel / PDF / طباعة
// ============================================================
export default function TailorCustomerReport({ data, fields, groups }) {
  const t = useTranslations("Tailoring");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { amount: money } = useCurrency();
  const nameOf = (x) =>
    x ? (locale === "ar" ? x.arName : x.enName || x.arName) : "";
  const [search, setSearch] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const open = (id) => {
    setResults(null);
    router.push(`${pathname}?customer=${id}`);
  };
  const find = async (value) => {
    const q = value.trim();
    if (!q) return;
    setLoading(true);
    const res = await searchTailorCustomersAction({ q });
    setLoading(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    if (res.data.length === 1) return open(res.data[0].id);
    setResults(res.data);
  };

  const c = data?.customer;
  const T = data?.totals;
  const fieldName = (id) => {
    const f = fields.find((x) => x.id === id);
    return f ? nameOf(f) : "";
  };
  // التفاصيل المختارة كنص (للتصدير وتحت الطلب)
  const stylesText = (l) =>
    l.styles
      .map(
        (g) => `${nameOf(g)}: ${g.choices.map((x) => nameOf(x)).join(" + ")}`,
      )
      .join(" | ");
  const measuresText = (l) =>
    l.measures
      .map((m) => `${nameOf(m) || fieldName(m.id)} ${m.value}`)
      .join(" - ");

  // ---------------- التصدير ----------------
  const build = () => ({
    title: `${t("CustomerReport")} - ${nameOf(c)}`,
    info: [
      [t("Customer"), `${nameOf(c)} (${c.code})`],
      ...(c.phone ? [[t("Phone"), c.phone]] : []),
    ],
    summary: [
      [t("OrdersCount"), String(T.orders)],
      [t("Pieces"), String(T.pieces)],
      [t("Total"), money(T.total)],
      [t("Paid"), money(T.paid)],
      [t("Due"), money(T.due)],
    ],
    columns: [
      { title: t("OrderNo"), key: "no", type: "text", width: 13 },
      { title: t("OrderDate"), key: "date", type: "text", width: 11 },
      { title: t("Person"), key: "person", type: "text", width: 16 },
      { title: t("Pieces"), key: "pieces", type: "number", width: 7 },
      { title: t("FabricType"), key: "fabric", type: "text", width: 16 },
      { title: t("Styles"), key: "styles", type: "text", width: 34 },
      { title: t("Measurements"), key: "measures", type: "text", width: 34 },
      { title: t("DeliveryDate"), key: "delivery", type: "text", width: 11 },
      { title: t("Status"), key: "status", type: "text", width: 10 },
      { title: t("Total"), key: "total", type: "money" },
      { title: t("Paid"), key: "paid", type: "money" },
      { title: t("Due"), key: "due", type: "money" },
    ],
    // سطر لكل شخص في كل طلب (المبالغ على أول سطر في الطلب)
    rows: data.orders.flatMap((o) =>
      o.lines.map((l, i) => ({
        key: `${o.id}-${l.id}`,
        no: i === 0 ? o.docNo : "",
        date: i === 0 ? formatDate(o.orderDate) : "",
        person: l.personName,
        pieces: l.pieces,
        fabric: l.fabricName ? `${l.fabricName} (${l.fabricQty})` : "",
        styles: stylesText(l),
        measures: measuresText(l),
        delivery: i === 0 ? formatDay(o.deliveryDate) : "",
        status: i === 0 ? t(`st_${o.status}`) : "",
        total: i === 0 && o.status !== "cancelled" ? o.total : null,
        paid: i === 0 && o.status !== "cancelled" ? o.paid : null,
        due: i === 0 && o.status !== "cancelled" ? o.due : null,
      })),
    ),
    totals: { pieces: T.pieces, total: T.total, paid: T.paid, due: T.due },
  });

  // ---------------- تفاصيل الطلب (تحت السطر) ----------------
  const orderLines = (o) => (
    <div className="flex flex-col gap-2">
      {o.lines.map((l) => (
        <Card key={l.id} size="small">
          <Space wrap size={16} className="mb-2">
            <b>{l.personName}</b>
            <span>{t("PiecesN", { n: l.pieces })}</span>
            {l.fabricName && (
              <span>
                {t("FabricType")}: {l.fabricName} ({l.fabricQty})
              </span>
            )}
            {l.notes && (
              <span className="text-slate-500">
                {t("Notes")}: {l.notes}
              </span>
            )}
          </Space>
          {l.measures.length > 0 && (
            <div className="mb-2">
              {l.measures.map((m) => (
                <Tag key={m.id} className="cp-chip">
                  {nameOf(m) || fieldName(m.id)}: <bdi>{m.value}</bdi>
                </Tag>
              ))}
            </div>
          )}
          {l.styles.length > 0 && (
            <div className="tailor-chosen">
              {l.styles.flatMap((g) =>
                g.choices.map((x) => (
                  <div key={`${g.id}-${x.id}`} className="tailor-chosen__item">
                    {x.image && <img src={styleImageUrl(x.image)} alt="" />}
                    <span className="tailor-chosen__group">{nameOf(g)}</span>
                    <b>{nameOf(x)}</b>
                  </div>
                )),
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  );

  const columns = [
    {
      title: t("OrderNo"),
      dataIndex: "docNo",
      width: 120,
      render: (v, r) => (
        <Link href={`/tailoring/${r.id}`}>
          <b>
            <bdi>{v}</bdi>
          </b>
        </Link>
      ),
    },
    {
      title: t("OrderDate"),
      dataIndex: "orderDate",
      width: 110,
      render: (v) => <bdi>{formatDate(v)}</bdi>,
    },
    {
      title: t("Persons"),
      key: "p",
      width: 180,
      render: (_, r) => r.persons.join("، "),
    },
    { title: t("Pieces"), dataIndex: "pieces", width: 80, align: "center" },
    {
      title: t("DeliveryDate"),
      dataIndex: "deliveryDate",
      width: 115,
      render: (v, r) => (
        <bdi
          style={r.late ? { color: C.dangerText, fontWeight: 700 } : undefined}
        >
          {formatDay(v)}
        </bdi>
      ),
    },
    {
      title: t("Tailor"),
      key: "tl",
      width: 130,
      render: (_, r) => (r.technician ? nameOf(r.technician) : "—"),
    },
    {
      title: t("Status"),
      dataIndex: "status",
      width: 110,
      align: "center",
      render: (v) => <Tag color={STATUS_COLOR[v]}>{t(`st_${v}`)}</Tag>,
    },
    {
      title: t("Total"),
      dataIndex: "total",
      width: 110,
      align: "end",
      render: (v) => money(v),
    },
    {
      title: t("Paid"),
      dataIndex: "paid",
      width: 110,
      align: "end",
      render: (v) => money(v),
    },
    {
      title: t("Due"),
      dataIndex: "due",
      width: 110,
      align: "end",
      render: (v, r) =>
        v > 0 ? (
          <span style={{ color: C.dangerText }}>{money(v)}</span>
        ) : r.status === "cancelled" ? (
          "—"
        ) : (
          <Tag color="green">{t("FullyPaid")}</Tag>
        ),
    },
    {
      title: t("Actions"),
      key: "a",
      width: 140,
      align: "center",
      render: (_, r) => (
        <Space size={4}>
          <Link href={`/tailoring/${r.id}`} title={t("ViewOrder")}>
            <EyeOutlined />
          </Link>
          <CardActions
            size="small"
            iconOnly
            orderId={r.id}
            fields={fields}
            groups={groups}
          />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("CustomerReport")}
        extra={c && data.orders.length ? <ExportButtons build={build} /> : null}
      />
      <Card size="small" className="mb-3">
        <Row gutter={[12, 8]}>
          <Col xs={24} md={10}>
            <SearchBox
              placeholder={t("FindCustomer")}
              value={search}
              loading={loading}
              onChange={setSearch}
              onSearch={find}
            />
          </Col>
        </Row>
        {results && <CustomerResults results={results} onPick={open} />}
      </Card>

      {!c ? (
        <Empty description={t("CustomerReportHint")} />
      ) : (
        <>
          <Card size="small" className="mb-3">
            <Space wrap size={24}>
              <span>
                <b>{nameOf(c)}</b>{" "}
                <bdi className="text-slate-500">({c.code})</bdi>
              </span>
              {c.phone && (
                <span>
                  {t("Phone")}: <bdi>{c.phone}</bdi>
                </span>
              )}
              <span>{t("PersonsN", { n: c.persons.length })}</span>
              <span>{t("OpenOrdersN", { n: T.open })}</span>
            </Space>
          </Card>

          <Row gutter={[12, 12]} className="mb-3">
            <Col xs={12} md={4}>
              <Card size="small">
                <Statistic title={t("OrdersCount")} value={T.orders} />
              </Card>
            </Col>
            <Col xs={12} md={5}>
              <Card size="small">
                <Statistic title={t("Pieces")} value={T.pieces} />
              </Card>
            </Col>
            <Col xs={12} md={5}>
              <Card size="small">
                <Statistic title={t("Total")} value={money(T.total)} />
              </Card>
            </Col>
            <Col xs={12} md={5}>
              <Card size="small">
                <Statistic
                  title={t("Paid")}
                  value={money(T.paid)}
                  styles={{ content: { color: C.successText } }}
                />
              </Card>
            </Col>
            <Col xs={24} md={5}>
              <Card size="small">
                <Statistic
                  title={t("Due")}
                  value={money(T.due)}
                  styles={{
                    content: { color: T.due > 0 ? C.dangerText : undefined },
                  }}
                />
              </Card>
            </Col>
          </Row>

          {/* الأشخاص: عدد الطلبات والثياب وآخر مقاس */}
          <Row gutter={[12, 12]} className="mb-3">
            {c.persons.map((p) => {
              const stat = data.persons.find((x) => x.name === p.name);
              const last = p.measurements[0];
              return (
                <Col key={p.id} xs={24} md={12} xl={8}>
                  <Card
                    size="small"
                    className="h-full"
                    title={
                      <Space wrap>
                        <b>{p.name}</b>
                        <Tag className="cp-chip">{t(`kin_${p.kinship}`)}</Tag>
                      </Space>
                    }
                    extra={
                      <span className="text-slate-500">
                        {t("PersonOrdersN", {
                          orders: stat?.orders ?? 0,
                          pieces: stat?.pieces ?? 0,
                        })}
                      </span>
                    }
                  >
                    {last ? (
                      <>
                        <div className="text-xs text-slate-500 mb-1">
                          {t("LastMeasurement")}:{" "}
                          <bdi>{formatDateTime(last.createdAt)}</bdi>
                        </div>
                        {fields
                          .filter((f) => last.measures[String(f.id)])
                          .map((f) => (
                            <Tag key={f.id} className="cp-chip">
                              {nameOf(f)}:{" "}
                              <bdi>{last.measures[String(f.id)]}</bdi>
                            </Tag>
                          ))}
                      </>
                    ) : (
                      <span className="text-slate-500">
                        {t("NoMeasurements")}
                      </span>
                    )}
                  </Card>
                </Col>
              );
            })}
          </Row>

          <Table
            bordered
            size="small"
            rowKey="id"
            columns={columns}
            dataSource={data.orders}
            tableLayout="fixed"
            scroll={{ x: columns.reduce((s, x) => s + x.width, 0) }}
            pagination={{
              pageSize: 50,
              showSizeChanger: false,
              hideOnSinglePage: true,
            }}
            expandable={{ expandedRowRender: orderLines }}
            locale={{ emptyText: t("NoOrders") }}
          />
        </>
      )}
    </div>
  );
}
