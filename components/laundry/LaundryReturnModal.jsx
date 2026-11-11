"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Descriptions,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
} from "antd";
import { RollbackOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import SearchBox from "@/components/common/SearchBox";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { useSaveKey } from "@/components/common/useSaveKey";
import PrintDocument from "@/components/printing/PrintDocument";
import SaleDocument from "@/components/sales/SaleDocument";
import {
  findSalesForReturnAction,
  getSaleAction,
  getSaleForReturnAction,
} from "@/actions/sale.actions";
import { laundryReturnAction } from "@/actions/laundry-order.actions";
import { formatDateTime } from "@/lib/dates";
import { saleDocNo } from "@/lib/doc-number";
import { C } from "@/lib/theme";
import "@/components/common/table.css";

// ============================================================
// مرتجع فاتورة من شاشة الاستلام (المغسلة)
// - البحث برقم الفاتورة ← السطور بالكمية المتاحة للمرتجع
// - نصيب الاشتراك (لو الفاتورة اتدفعت من الرصيد) بيرجع للرصيد تلقائي،
//   والباقي بطريقة الاسترداد المختارة (الافتراضي كاش)
// - بعد الحفظ مستند المرتجع بيتطبع
// ============================================================
export default function LaundryReturnModal({
  methods,
  printSettings,
  company,
  onClose,
}) {
  const t = useTranslations("Laundry");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const saveKey = useSaveKey();
  const [q, setQ] = useState("");
  const [found, setFound] = useState(null); // أكتر من فاتورة بنفس الرقم
  const [sale, setSale] = useState(null);
  const [qtys, setQtys] = useState({});
  const cash = methods.find((m) => m.type === "cash") ?? methods[0];
  const [methodId, setMethodId] = useState(cash?.id ?? null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(null);
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);

  const open = async (id) => {
    const res = await getSaleForReturnAction(id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    if (!res.data) return message.warning(t("SaleNotFound"));
    setSale(res.data);
    setFound(null);
    // الافتراضي: كل المتاح
    setQtys(
      Object.fromEntries(res.data.items.map((i) => [i.id, i.available])),
    );
  };

  const search = async (value) => {
    const text = (value ?? q).trim();
    if (!text) return;
    const res = await findSalesForReturnAction({ value: text });
    if (!res.success) return showActionError(res, tAlerts, locale);
    if (!res.data.length) return message.warning(t("SaleNotFound"));
    if (res.data.length === 1) return open(res.data[0].id);
    setFound(res.data);
  };

  // تقدير المرتجع (السيرفر بيحسبه بالظبط): إجمالي السطر ÷ الكمية × المرتجع
  const lineTotal = (i) =>
    Number(i.qty) > 0
      ? (Number(i.totalAmount) / Number(i.qty)) * (qtys[i.id] || 0)
      : 0;
  const total = sale
    ? Math.round(sale.items.reduce((s, i) => s + lineTotal(i), 0) * 100) / 100
    : 0;
  // نصيب الاشتراك: بنفس نسبة المدفوع من الرصيد في الفاتورة
  const subPaid = sale
    ? sale.payments
        .filter((p) => p.paymentMethod?.type === "sub")
        .reduce((s, p) => s + Number(p.amount), 0)
    : 0;
  const toWallet =
    sale && Number(sale.totalAmount) > 0
      ? Math.round(((total * subPaid) / Number(sale.totalAmount)) * 100) / 100
      : 0;

  const save = async () => {
    const items = sale.items
      .filter((i) => qtys[i.id] > 0)
      .map((i) => ({ itemId: i.id, qty: qtys[i.id] }));
    if (!items.length) return message.warning(t("ReturnPickQty"));
    setSaving(true);
    const res = await saveKey.send(laundryReturnAction, {
      saleId: sale.id,
      items,
      refundMethodId: methodId,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("ReturnSavedN", { n: saleDocNo("return", res.data.number, res.data.docCode) }));
    const full = await getSaleAction(res.data.id);
    if (full.success && full.data) setPrinting(full.data);
    else onClose();
  };

  return (
    <Modal
      open
      width={900}
      footer={null}
      onCancel={onClose}
      title={
        <span>
          <RollbackOutlined /> {t("ReturnTitle")}
        </span>
      }
      destroyOnHidden
    >
      <SearchBox
        className="mb-3"
        autoFocus
        placeholder={t("ReturnSearch")}
        value={q}
        onChange={setQ}
        onSearch={search}
      />

      {found && (
        <Space direction="vertical" className="mb-3" style={{ width: "100%" }}>
          {found.map((s) => (
            <Button key={s.id} block onClick={() => open(s.id)}>
              <bdi>{saleDocNo("sale", s.number, s.docCode)}</bdi> —{" "}
              {formatDateTime(s.date)} —{" "}
              {locale === "ar" ? s.customerArName : s.customerEnName} —{" "}
              <bdi>{money(s.totalAmount)}</bdi>
            </Button>
          ))}
        </Space>
      )}

      {sale && (
        <>
          <Descriptions
            size="small"
            bordered
            column={{ xs: 1, sm: 3 }}
            className="mb-3"
            items={[
              {
                key: "n",
                label: t("Invoice"),
                children: <bdi>{saleDocNo("sale", sale.number, sale.docCode)}</bdi>,
              },
              {
                key: "c",
                label: t("Customer"),
                children:
                  (locale === "ar" ? sale.customerArName : sale.customerEnName) ||
                  "—",
              },
              {
                key: "t",
                label: t("Total"),
                children: <bdi>{money(sale.totalAmount)}</bdi>,
              },
            ]}
          />
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={sale.items}
            scroll={{ x: 640 }}
            className="mb-3"
            columns={[
              {
                title: t("Item"),
                render: (_, i) => (
                  <span>
                    <b>{nm(i)}</b>
                    {i.note && (
                      <div style={{ color: C.muted, fontSize: 12 }}>{i.note}</div>
                    )}
                  </span>
                ),
              },
              { title: t("Qty"), width: 70, render: (_, i) => Number(i.qty) },
              {
                title: t("ReturnAvailable"),
                width: 90,
                render: (_, i) => Number(i.available),
              },
              {
                title: t("ReturnQty"),
                width: 120,
                render: (_, i) => (
                  <InputNumber
                    min={0}
                    max={Number(i.available)}
                    precision={0}
                    disabled={!(i.available > 0)}
                    value={qtys[i.id]}
                    onChange={(v) =>
                      setQtys((prev) => ({ ...prev, [i.id]: v ?? 0 }))
                    }
                    style={{ width: "100%" }}
                  />
                ),
              },
              {
                title: t("Total"),
                width: 110,
                render: (_, i) => <bdi>{money(lineTotal(i))}</bdi>,
              },
            ]}
          />

          <div className="lp-return-sum">
            <div>
              <span>{t("ReturnTotal")}</span>
              <b>
                <bdi>{money(total)}</bdi>
              </b>
            </div>
            {toWallet > 0 && (
              <div style={{ color: C.successText }}>
                <span>{t("ReturnToWallet")}</span>
                <b>
                  <bdi>{money(toWallet)}</bdi>
                </b>
              </div>
            )}
            <div>
              <span>{t("ReturnCash")}</span>
              <b>
                <bdi>{money(Math.max(0, total - toWallet))}</bdi>
              </b>
            </div>
          </div>
          {toWallet > 0 && (
            <Alert
              type="info"
              showIcon
              className="mb-3"
              title={t("ReturnWalletHint")}
            />
          )}

          <Space wrap className="mb-3" style={{ width: "100%" }}>
            <span>{t("RefundMethod")}</span>
            <Select
              style={{ minWidth: 180 }}
              value={methodId}
              onChange={setMethodId}
              options={methods.map((m) => ({ value: m.id, label: nm(m) }))}
            />
            <Input
              autoComplete="off"
              maxLength={500}
              placeholder={t("Notes")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ minWidth: 260 }}
            />
          </Space>
          <Button
            type="primary"
            danger
            size="large"
            block
            icon={<RollbackOutlined />}
            loading={saving}
            disabled={!(total > 0) || !methodId}
            onClick={save}
          >
            {t("ReturnSave")}
          </Button>
        </>
      )}

      {printing && printSettings && (
        <PrintDocument
          paperSize={printSettings.paperSize}
          onDone={() => {
            setPrinting(null);
            onClose();
          }}
        >
          <SaleDocument
            settings={printSettings}
            company={company}
            doc={printing}
            kind="return"
          />
        </PrintDocument>
      )}
    </Modal>
  );
}
