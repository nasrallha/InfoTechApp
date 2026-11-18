"use client";

import { useState } from "react";
import { Alert, Button, Card, Col, InputNumber, Row, Segmented, Space, Table, Tag } from "antd";
import { ArrowRightOutlined, DesktopOutlined, LockOutlined, SearchOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import { formatDateTime, formatDay } from "@/lib/dates";
import { branchShiftName, shiftDay } from "@/lib/shift-label";
import { formatDocNo } from "@/lib/doc-number";
import DayPicker from "@/components/common/DayPicker";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import PrintActions from "@/components/printing/PrintActions";
import { closeBranchShiftAction } from "@/actions/shift.actions";
import ShiftReport from "./ShiftReport";
import ShiftPrint from "./ShiftPrint";
import { C } from "@/lib/theme";
import "@/components/common/table.css";

const userName = (u, locale) => (u ? (locale === "ar" ? u.arFullname : u.enFullname) : "");

// الفرق: أخضر مطابق / أزرق زيادة / أحمر عجز
const DiffTag = ({ value, money }) => (
  <Tag color={value === 0 ? "green" : value > 0 ? "blue" : "red"}>
    {value > 0 ? "+" : ""}
    {money(value)}
  </Tag>
);

// اسم وردية الفرع: اسم الفترة، وتحتها «الوردية 2 — 30/10/2026»
function BranchShiftTitle({ bs, t, locale }) {
  const name = branchShiftName(bs, locale);
  const day = t("DayShift", { n: bs.dayNo, date: formatDay(shiftDay(bs)) });
  return name ? (
    <>
      <b>{name}</b>
      <div style={{ fontSize: 12, color: C.muted }}>{day}</div>
    </>
  ) : (
    <b>{day}</b>
  );
}

// ============================================================
// التبويب بين ورديات الفرع والأدراج (نفس الصفحة: ?view=drawers)
// ============================================================
export function ShiftsTabs({ view }) {
  const router = useRouter();
  const t = useTranslations("Shifts");
  return (
    <Segmented
      className="mb-3"
      value={view}
      onChange={(v) => router.push(v === "drawers" ? "/sales/shifts?view=drawers" : "/sales/shifts")}
      options={[
        { value: "branch", label: t("BranchShifts") },
        { value: "drawers", label: t("Drawers") },
      ]}
    />
  );
}

// ============================================================
// قائمة ورديات الفرع (المشرف: ورديات الفرع / الكاشير: الورديات اللي ليه فيها درج)
// ============================================================
export function BranchShiftsList({ data, status, day, dayNo, canPos }) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("Shifts");
  const tSidebar = useTranslations("Sidebar");
  const { amount: money } = useCurrency();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  // البحث: يوم العمل + ترتيب الوردية فيه (Enter أو زر البحث)
  const [find, setFind] = useState({ day: day ?? null, no: dayNo ?? null });
  const search = () => go({ day: find.day, no: find.day ? find.no : null });

  const go = (params) => {
    const next = { status, day, no: dayNo, page: 1, ...params };
    const query = new URLSearchParams();
    if (next.status) query.set("status", next.status);
    if (next.day) query.set("day", next.day);
    if (next.day && next.no) query.set("no", String(next.no));
    if (next.page > 1) query.set("page", String(next.page));
    const qs = query.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  const columns = [
    {
      title: t("BranchShift"),
      key: "n",
      width: 180,
      align: "center",
      render: (_, s) => (
        <Link href={`/sales/shifts/branch/${s.id}`}>
          <BranchShiftTitle bs={s} t={t} locale={locale} />
        </Link>
      ),
    },
    { title: t("Branch"), key: "b", width: 140, render: (_, s) => nameOf(s.branch) },
    {
      title: t("OpenedAt"),
      key: "o",
      width: 150,
      align: "center",
      render: (_, s) => <bdi>{formatDateTime(s.openedAt)}</bdi>,
    },
    {
      title: t("ClosedAt"),
      key: "c",
      width: 150,
      align: "center",
      render: (_, s) => (s.closedAt ? <bdi>{formatDateTime(s.closedAt)}</bdi> : "—"),
    },
    {
      title: t("Drawers"),
      key: "dr",
      width: 100,
      align: "center",
      render: (_, s) =>
        s.openDrawers ? `${s.drawersCount} (${t("OpenN", { n: s.openDrawers })})` : s.drawersCount,
    },
    { title: t("Invoices"), key: "cnt", width: 90, align: "center", render: (_, s) => s.invoices },
    {
      title: t("Difference"),
      key: "d",
      width: 120,
      align: "center",
      render: (_, s) =>
        s.status === "open" ? (
          <Tag color="green">{t("OpenNow")}</Tag>
        ) : (
          <DiffTag value={s.difference} money={money} />
        ),
    },
  ];
  const width = columns.reduce((s, c) => s + c.width, 0);

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">{tSidebar("Shifts")}</h1>
        {canPos && (
          <Link href="/pos">
            <Button type="primary" size="large" icon={<DesktopOutlined />}>
              {t("GoToPos")}
            </Button>
          </Link>
        )}
      </div>
      <ShiftsTabs view="branch" />
      <Space className="mb-3 cp-filters" wrap>
        <Segmented
          value={status ?? "all"}
          onChange={(v) => go({ status: v === "all" ? undefined : v })}
          options={[
            { value: "all", label: t("All") },
            { value: "open", label: t("OpenNow") },
            { value: "closed", label: t("Closed") },
          ]}
        />
        <DayPicker
          allowClear
          style={{ width: 150 }}
          placeholder={t("BusinessDay")}
          value={find.day}
          onChange={(v) => setFind((f) => ({ ...f, day: v ?? null }))}
        />
        <InputNumber
          min={1}
          max={99}
          precision={0}
          controls={false}
          style={{ width: 120 }}
          prefix={t("ShiftOrderPrefix")}
          disabled={!find.day}
          value={find.no}
          onChange={(v) => setFind((f) => ({ ...f, no: v ?? null }))}
          onPressEnter={search}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={search}>
          {t("Search")}
        </Button>
      </Space>
      <Table
        bordered
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={data.rows}
        tableLayout="fixed"
        scroll={{ x: width }}
        pagination={{
          current: data.page,
          pageSize: data.pageSize,
          total: data.total,
          showSizeChanger: false,
          onChange: (page) => go({ page }),
        }}
      />
    </div>
  );
}

// ============================================================
// تفاصيل وردية الفرع: الأدراج + الملخص المجمّع + القفل اليدوي + الطباعة
// ============================================================
export function BranchShiftDetails({ bs, company, printSettings }) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Shifts");
  const tAlerts = useTranslations("Alerts");
  const { amount: money } = useCurrency();
  const [closing, setClosing] = useState(false);
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const allClosed = bs.drawers.every((x) => x.status === "closed");
  const title = branchShiftName(bs, locale);

  // للتقرير والطباعة: العدّ والتسليم مجمّع لما كل الأدراج تتقفل
  const merged = {
    ...bs,
    status: allClosed ? "closed" : "open",
    branchName: title,
    expectedOpening: null,
    denominations: null,
    notes: null,
    ...bs.counted,
    cardExpected: bs.summary.cardExpected,
    cardCounted: allClosed && bs.counted.cardCounted ? bs.counted.cardCounted : null,
    cardDifference: allClosed && bs.counted.cardCounted ? bs.counted.cardDifference : null,
  };

  const close = async () => {
    setClosing(true);
    const res = await closeBranchShiftAction(bs.id);
    setClosing(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("BranchShiftClosedMsg"));
    router.refresh();
  };

  const columns = [
    {
      title: t("ShiftNo"),
      key: "n",
      width: 130,
      align: "center",
      render: (_, x) => (
        <Link href={`/sales/shifts/${x.id}`}>
          <b>{formatDocNo("shift", x.number, x.docCode)}</b>
        </Link>
      ),
    },
    { title: t("Cashier"), key: "u", width: 150, render: (_, x) => userName(x.user, locale) },
    {
      title: t("OpenedAt"),
      key: "o",
      width: 150,
      align: "center",
      render: (_, x) => <bdi>{formatDateTime(x.openedAt)}</bdi>,
    },
    { title: t("SalesCount"), key: "c", width: 90, align: "center", render: (_, x) => x.salesCount },
    {
      title: t("NetSales"),
      key: "s",
      width: 120,
      align: "end",
      render: (_, x) => (x.netTotal == null ? "—" : money(x.netTotal)),
    },
    {
      title: t("Difference"),
      key: "d",
      width: 120,
      align: "center",
      render: (_, x) =>
        x.status === "open" ? (
          <Tag color="green">{t("OpenNow")}</Tag>
        ) : (
          <DiffTag value={Number(x.difference ?? 0)} money={money} />
        ),
    },
  ];
  const width = columns.reduce((s, c) => s + c.width, 0);

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">
          {t("BranchShift")}{" "}
          <Tag color="blue">
            {title ? `${title} — ` : ""}
            {t("DayShift", { n: bs.dayNo, date: formatDay(shiftDay(bs)) })}
          </Tag>
          {bs.status === "open" ? <Tag color="green">{t("OpenNow")}</Tag> : <Tag>{t("Closed")}</Tag>}
        </h1>
        <Space wrap>
          {!bs.blind && (
            <PrintActions
              defaultPaper={printSettings.paperSize}
              fileName={`${t("BranchShift")} ${bs.dayNo}`}
              renderDoc={(paper) => (
                <ShiftPrint
                  shift={merged}
                  company={company}
                  settings={{ ...printSettings, paperSize: paper }}
                />
              )}
            />
          )}
          {bs.canClose && (
            <Button danger type="primary" icon={<LockOutlined />} loading={closing} onClick={close}>
              {t("CloseBranchShift")}
            </Button>
          )}
          <Link href="/sales/shifts">
            <Button icon={<ArrowRightOutlined />}>{t("BackToList")}</Button>
          </Link>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card size="small" className="mb-3">
            <div className="pur-info">
              <div>
                <span>{t("Branch")}</span>
                <span>{nameOf(bs.branch)}</span>
              </div>
              <div>
                <span>{t("OpenedAt")}</span>
                <bdi>{formatDateTime(bs.openedAt)}</bdi>
              </div>
              <div>
                <span>{t("OpenedBy")}</span>
                <span>{userName(bs.openedBy, locale)}</span>
              </div>
              {bs.closedAt && (
                <div>
                  <span>{t("ClosedAt")}</span>
                  <bdi>{formatDateTime(bs.closedAt)}</bdi>
                </div>
              )}
              {bs.closedBy && (
                <div>
                  <span>{t("ClosedBy")}</span>
                  <span>{userName(bs.closedBy, locale)}</span>
                </div>
              )}
            </div>
          </Card>
          <Card size="small" title={t("Drawers")}>
            {bs.status === "open" && !allClosed && (
              <Alert type="info" showIcon className="mb-2" title={t("BranchShiftOpenDrawersHint")} />
            )}
            <Table
              bordered
              size="small"
              rowKey="id"
              columns={columns}
              dataSource={bs.drawers}
              tableLayout="fixed"
              scroll={{ x: width }}
              pagination={false}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card size="small" title={t("BranchShiftSummary")}>
            {bs.blind ? (
              <Alert type="info" showIcon title={t("BlindReportHint")} />
            ) : (
              <ShiftReport summary={bs.summary} shift={merged} />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
