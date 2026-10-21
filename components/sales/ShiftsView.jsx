"use client";

import { useState } from "react";
import { Alert, Button, Card, Segmented, Space, Table, Tag } from "antd";
import {
  ArrowRightOutlined,
  DesktopOutlined,
  LockOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import { formatDateTime } from "@/lib/dates";
import { formatDocNo } from "@/lib/doc-number";
import { useCurrency } from "@/components/common/CurrencyProvider";
import PrintActions from "@/components/printing/PrintActions";
import { useCan, useCurrentUser } from "@/components/auth/AuthProvider";
import ShiftReport from "./ShiftReport";
import ShiftPrint from "./ShiftPrint";
import { CashMovementModal, CloseShiftModal } from "./ShiftModals";
import "@/components/common/table.css";

const userName = (u, locale) =>
  u ? (locale === "ar" ? u.arFullname : u.enFullname) : "";

// ============================================================
// قائمة الورديات (الكاشير يرى وردياته، والمشرف ورديات الفرع)
// ============================================================
export function ShiftsList({ data, status, canPos }) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("Shifts");
  const tSidebar = useTranslations("Sidebar");
  const { amount: money } = useCurrency();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  const go = (params) => {
    const next = { status, page: 1, ...params };
    const query = new URLSearchParams();
    if (next.status) query.set("status", next.status);
    if (next.page > 1) query.set("page", String(next.page));
    const qs = query.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  const columns = [
    {
      title: t("ShiftNo"),
      key: "n",
      width: 100,
      align: "center",
      render: (_, s) => (
        <Link href={`/sales/shifts/${s.id}`}>
          <b>{formatDocNo("shift", s.number)}</b>
        </Link>
      ),
    },
    {
      title: t("Cashier"),
      key: "u",
      width: 160,
      render: (_, s) => userName(s.user, locale),
    },
    {
      title: t("Branch"),
      key: "b",
      width: 140,
      render: (_, s) => nameOf(s.branch),
    },
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
      render: (_, s) =>
        s.closedAt ? <bdi>{formatDateTime(s.closedAt)}</bdi> : "—",
    },
    {
      title: t("Invoices"),
      key: "cnt",
      width: 90,
      align: "center",
      render: (_, s) => s._count.sales,
    },
    {
      title: t("Difference"),
      key: "d",
      width: 120,
      align: "center",
      render: (_, s) =>
        s.status === "open" ? (
          <Tag color="green">{t("OpenNow")}</Tag>
        ) : (
          <Tag
            color={
              s.difference === 0 ? "green" : s.difference > 0 ? "blue" : "red"
            }
          >
            {s.difference > 0 ? "+" : ""}
            {money(s.difference)}
          </Tag>
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
      <Space className="mb-3">
        <Segmented
          value={status ?? "all"}
          onChange={(v) => go({ status: v === "all" ? undefined : v })}
          options={[
            { value: "all", label: t("All") },
            { value: "open", label: t("OpenNow") },
            { value: "closed", label: t("Closed") },
          ]}
        />
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
// تفاصيل وردية: الملخص، القفل، طباعة تقرير الوردية
// ============================================================
export function ShiftDetails({ shift, company, printSettings, autoPrint }) {
  const [closing, setClosing] = useState(false);
  const [moving, setMoving] = useState(false);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Shifts");
  const can = useCan();
  const me = useCurrentUser();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const mine = shift.status === "open" && shift.userId === me?.id;

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">
          {t("Shift")} <bdi>{formatDocNo("shift", shift.number)}</bdi>{" "}
          {shift.status === "open" ? (
            <Tag color="green">{t("OpenNow")}</Tag>
          ) : (
            <Tag>{t("Closed")}</Tag>
          )}
        </h1>
        <Space wrap>
          {!shift.blind && (
            <PrintActions
              autoPrint={autoPrint}
              defaultPaper={printSettings.paperSize}
              fileName={formatDocNo("shift", shift.number)}
              renderDoc={(paper) => (
                <ShiftPrint
                  shift={shift}
                  company={company}
                  settings={{ ...printSettings, paperSize: paper }}
                />
              )}
            />
          )}
          {mine && can("shifts.cashMovement") && (
            <Button icon={<SwapOutlined />} onClick={() => setMoving(true)}>
              {t("DrawerCash")}
            </Button>
          )}
          {shift.canClose && (
            <Button
              danger
              type="primary"
              icon={<LockOutlined />}
              onClick={() => setClosing(true)}
            >
              {t("CloseShift")}
            </Button>
          )}
          <Link href="/sales/shifts">
            <Button icon={<ArrowRightOutlined />}>{t("BackToList")}</Button>
          </Link>
        </Space>
      </div>

      <Card size="small" className="mb-3">
        <div className="pur-info">
          <div>
            <span>{t("Cashier")}</span>
            <span>{userName(shift.user, locale)}</span>
          </div>
          <div>
            <span>{t("Branch")}</span>
            <span>{nameOf(shift.branch)}</span>
          </div>
          <div>
            <span>{t("OpenedAt")}</span>
            <bdi>{formatDateTime(shift.openedAt)}</bdi>
          </div>
          {shift.closedAt && (
            <div>
              <span>{t("ClosedAt")}</span>
              <bdi>{formatDateTime(shift.closedAt)}</bdi>
            </div>
          )}
          {shift.closedBy && (
            <div>
              <span>{t("ClosedBy")}</span>
              <span>{userName(shift.closedBy, locale)}</span>
            </div>
          )}
        </div>
        {shift.notes && (
          <div className="mt-2">
            {t("Notes")}: {shift.notes}
          </div>
        )}
      </Card>

      <Card size="small">
        {shift.blind ? (
          <Alert type="info" showIcon title={t("BlindReportHint")} />
        ) : (
          <ShiftReport summary={shift.summary} shift={shift} />
        )}
      </Card>

      <CloseShiftModal
        shiftId={shift.id}
        open={closing}
        onClose={() => setClosing(false)}
        onClosed={() => {
          setClosing(false);
          router.replace(`/sales/shifts/${shift.id}?print=1`);
          router.refresh();
        }}
      />
      <CashMovementModal
        open={moving}
        onClose={() => setMoving(false)}
        onDone={() => {
          setMoving(false);
          router.refresh();
        }}
      />
    </div>
  );
}
