"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Input, Table, Tag } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import { showActionError } from "@/components/common/actionError";
import { useCan } from "@/components/auth/AuthProvider";
import { Link, useRouter } from "@/i18n/routing";
import { formatDate } from "@/lib/dates";
import { saleDocNo } from "@/lib/doc-number";
import { listClaimsAction } from "@/actions/warranty-claim.actions";
import { ClaimStatusTag, claimAgeDays } from "./ClaimStatusTag";
import { CLAIM_COLORS } from "./claimColors";
import { C } from "@/lib/theme";
import "./claims.css";

const FILTERS = [
  "open",
  "received",
  "inspecting",
  "at_agent",
  "back",
  "ready",
  "delivered",
  "cancelled",
  "all",
];
// عند الوكيل أكتر من كده: بالأحمر
export const AGENT_LATE_DAYS = 14;

// ============================================================
// طلبات الضمان والصيانة: القايمة بالحالة والبحث
// ============================================================
export default function ClaimsListView() {
  const t = useTranslations("Claims");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const router = useRouter();
  const can = useCan();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [status, setStatus] = useState("open");
  const [q, setQ] = useState("");
  const [text, setText] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({
    key: null,
    total: 0,
    rows: [],
    counts: {},
  });

  const key = JSON.stringify({ status, q, page });
  const load = useCallback(
    () => listClaimsAction({ status, q, page }),
    [status, q, page],
  );
  useEffect(() => {
    let alive = true;
    load().then((res) => {
      if (!alive) return;
      if (!res.success) showActionError(res, tAlerts, locale);
      setResult((prev) =>
        res.success ? { key, ...res.data } : { ...prev, key },
      );
    });
    return () => {
      alive = false;
    };
  }, [load, key, tAlerts, locale]);

  return (
    <>
      <PageHeader
        title={t("Title")}
        subtitle={t("Subtitle")}
        buttonTitle={can("warrantyClaims.create") ? t("NewTitle") : null}
        onButtonClick={() => router.push("/warranty-claims/new")}
      />
      <Card size="small" className="mb-3">
        {/* أزرار المراحل بألوانها وعدد كل مرحلة */}
        <div className="claim-filters mb-3">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`claim-filter ${status === f ? "is-active" : ""}`}
              style={{ "--c": CLAIM_COLORS[f] }}
              onClick={() => {
                setPage(1);
                setStatus(f);
              }}
            >
              {t(`Filter_${f}`)}
              <span className="claim-filter__count">
                {result.counts?.[f] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <Input.Search
          allowClear
          style={{ maxWidth: 420 }}
          placeholder={t("SearchPlaceholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onSearch={(v) => {
            setPage(1);
            setQ(v.trim());
          }}
        />
      </Card>

      <Table
        className="claim-table"
        size="small"
        rowKey="id"
        rowClassName={() => "claim-row"}
        loading={result.key !== key}
        dataSource={result.rows}
        scroll={{ x: 1050 }}
        onRow={(r) => ({
          onClick: () => router.push(`/warranty-claims/${r.id}`),
          // لون المرحلة لخلفية الصف
          style: { cursor: "pointer", "--c": CLAIM_COLORS[r.status] },
        })}
        pagination={{
          current: page,
          pageSize: 30,
          total: result.total,
          showSizeChanger: false,
          onChange: setPage,
        }}
        columns={[
          {
            title: t("Number"),
            width: 90,
            render: (_, r) => (
              <Link href={`/warranty-claims/${r.id}`}>
                <bdi>WC-{r.number}</bdi>
              </Link>
            ),
          },
          {
            title: t("Date"),
            width: 100,
            render: (_, r) => <bdi>{formatDate(r.createdAt)}</bdi>,
          },
          {
            title: t("Customer"),
            width: 190,
            render: (_, r) => (
              <span>
                {nm(r.customer) || r.customerName}
                {(r.customer?.phone || r.customerPhone) && (
                  <div style={{ color: C.muted, fontSize: 12 }}>
                    <bdi>{r.customerPhone || r.customer?.phone}</bdi>
                  </div>
                )}
              </span>
            ),
          },
          {
            title: t("Device"),
            width: 220,
            render: (_, r) => (
              <span>
                {nm(r.product) || r.deviceName}
                {r.serialText && (
                  <div style={{ color: C.muted, fontSize: 12 }}>
                    <bdi>{r.serialText}</bdi>
                  </div>
                )}
              </span>
            ),
          },
          {
            title: t("Kind"),
            width: 110,
            render: (_, r) => (
              <Tag color={r.kind === "warranty" ? "green" : "gold"}>
                {t(`Kind_${r.kind}`)}
              </Tag>
            ),
          },
          {
            title: t("Status"),
            width: 170,
            render: (_, r) => {
              const late =
                r.status === "at_agent" &&
                claimAgeDays(r.sentAt) > AGENT_LATE_DAYS;
              return (
                <span>
                  <ClaimStatusTag status={r.status} />
                  {r.status === "at_agent" && (
                    <Tag
                      color={late ? "red" : "default"}
                      icon={late ? <WarningOutlined /> : null}
                    >
                      {t("DaysN", { n: claimAgeDays(r.sentAt) })}
                    </Tag>
                  )}
                </span>
              );
            },
          },
          {
            title: t("Agent"),
            width: 140,
            render: (_, r) => nm(r.supplier) || "—",
          },
          {
            title: t("Invoice"),
            width: 90,
            render: (_, r) =>
              r.sale ? <bdi>{saleDocNo("sale", r.sale.number)}</bdi> : "—",
          },
        ]}
      />
    </>
  );
}
