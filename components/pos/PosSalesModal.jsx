"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Empty, Input, Modal, Space, Spin } from "antd";
import { EditOutlined, EyeOutlined, PrinterOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/dates";
import { saleDocNo } from "@/lib/doc-number";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { showActionError } from "@/components/common/actionError";
import { useCan } from "@/components/auth/AuthProvider";
import { Link } from "@/i18n/routing";
import DocPreviewModal from "@/components/printing/DocPreviewModal";
import PrintDocument from "@/components/printing/PrintDocument";
import InvoiceA4 from "@/components/printing/invoice/InvoiceA4";
import SaleDocument from "@/components/sales/SaleDocument";
import {
  posRecentSalesAction,
  posSaleForPrintAction,
} from "@/actions/sale.actions";

// ============================================================
// الكاشير: فواتير سابقة ← عرض وإعادة طباعة (كاشير أو A4) وتعديل (بالصلاحية)
// - البحث برقم الفاتورة بس (Enter أو الزر)، ومن غير بحث مفيش عرض
// ============================================================
export default function PosSalesModal({
  open,
  onClose,
  company,
  printSettings,
  // المطعم: إعادة طباعة الفاتورة على طابعة الكاشير عن طريق الوسيط (الفاتورة بس، من غير تحضير)
  // (doc, fallback) ← true لو راحت للوسيط
  onAgentPrint,
}) {
  const t = useTranslations("Pos");
  // التعديل: بصلاحية تعديل فواتير البيع، في تاب جديد (السلة متضيعش)
  // وشروطه في شاشة التعديل نفسها (الزكاة / الوردية / المرتجع / السداد)
  const can = useCan();
  const canEdit = can("sales.update");
  const tS = useTranslations("Sales");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const nm = (ar, en) => (locale === "ar" ? ar || en : en || ar);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState({ key: null, rows: [] });
  const [loadingId, setLoadingId] = useState(null);
  // الفاتورة المفتوحة (معاينة) + الطباعة
  const [doc, setDoc] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [printPaper, setPrintPaper] = useState(null);
  const inputRef = useRef(null);
  const defaultPaper = printSettings?.paperSize ?? "80mm";

  useEffect(() => {
    // من غير بحث: مفيش عرض (البحث برقم الفاتورة بس)
    if (!open || !search) return;
    let alive = true;
    posRecentSalesAction({ q: search }).then((res) => {
      if (!alive) return;
      if (!res.success) showActionError(res, tAlerts, locale);
      setResult({ key: search, rows: res.success ? res.data : [] });
    });
    return () => {
      alive = false;
    };
  }, [open, search, tAlerts, locale]);

  // تحميل الفاتورة كاملة ← معاينة أو طباعة على طول
  const load = async (row, then) => {
    setLoadingId(`${then}-${row.id}`);
    const res = await posSaleForPrintAction(row.id);
    setLoadingId(null);
    if (!res.success) return showActionError(res, tAlerts, locale);
    setDoc(res.data);
    if (then === "view") setPreviewOpen(true);
    else printAs(defaultPaper, res.data);
  };

  // الكاشير (حراري): طابعة الكاشير عن طريق الوسيط لو متاح، وإلا نافذة الطباعة
  const printAs = (paper, d = doc) => {
    if (paper !== "A4" && onAgentPrint?.(d, () => setPrintPaper(paper))) return;
    setPrintPaper(paper);
  };

  const renderDoc = (paper) =>
    paper === "A4" ? (
      <InvoiceA4
        kind="sale"
        doc={doc}
        company={company}
        settings={printSettings}
      />
    ) : (
      <SaleDocument
        settings={{ ...printSettings, paperSize: paper }}
        company={company}
        doc={doc}
        kind="sale"
      />
    );

  const loading = Boolean(search) && result.key !== search;

  return (
    <>
      <Modal
        open={open}
        onCancel={onClose}
        footer={null}
        width={640}
        title={t("PrevSales")}
        destroyOnHidden
        afterOpenChange={(v) => v && inputRef.current?.focus()}
      >
        <Input.Search
          ref={inputRef}
          allowClear
          enterButton
          autoComplete="off"
          placeholder={t("PrevSalesSearch")}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (!e.target.value) setSearch("");
          }}
          onSearch={(v) => setSearch(v.trim())}
          className="mb-2"
        />
        <Spin spinning={loading}>
          {!search
            ? null
            : !result.rows.length || loading
              ? !loading && <Empty description={t("PrevSalesNone")} />
              : result.rows.map((r) => (
                  <div key={r.id} className="pos-line">
                    <div>
                      <div className="pos-line__name">
                        <bdi>{saleDocNo("sale", r.number, r.docCode)}</bdi> ·{" "}
                        {nm(
                          r.customerArName ?? r.customer?.arName,
                          r.customerEnName ?? r.customer?.enName,
                        ) || tS("CashCustomer")}
                      </div>
                      <div className="pos-line__meta">
                        <bdi>{formatDateTime(r.createdAt)}</bdi>
                        {r.customer?.phone && (
                          <bdi style={{ marginInlineStart: 8 }}>
                            {r.customer.phone}
                          </bdi>
                        )}
                      </div>
                    </div>
                    <div className="pos-line__total">
                      {money(r.totalAmount)}
                    </div>
                    <div className="pos-line__controls">
                      <Space size={6}>
                        <Button
                          size="small"
                          icon={<EyeOutlined />}
                          loading={loadingId === `view-${r.id}`}
                          onClick={() => load(r, "view")}
                        >
                          {t("ViewSale")}
                        </Button>
                        <Button
                          size="small"
                          type="primary"
                          icon={<PrinterOutlined />}
                          loading={loadingId === `print-${r.id}`}
                          onClick={() => load(r, "print")}
                        >
                          {t("Reprint")}
                        </Button>
                        {canEdit && (
                          <Link
                            href={`/invoices/sales/${r.id}/edit`}
                            target="_blank"
                          >
                            <Button size="small" icon={<EditOutlined />}>
                              {t("EditSale")}
                            </Button>
                          </Link>
                        )}
                      </Space>
                    </div>
                  </div>
                ))}
        </Spin>
      </Modal>

      {doc && previewOpen && (
        <DocPreviewModal
          open
          onClose={() => setPreviewOpen(false)}
          defaultPaper={defaultPaper}
          thermal={defaultPaper === "A4" ? "80mm" : defaultPaper}
          renderDoc={renderDoc}
          onPrint={(paper) => printAs(paper)}
        />
      )}

      {doc && printPaper && (
        <PrintDocument
          paperSize={printPaper}
          onDone={() => setPrintPaper(null)}
        >
          {renderDoc(printPaper)}
        </PrintDocument>
      )}
    </>
  );
}
