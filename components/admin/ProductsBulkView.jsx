"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Form,
  InputNumber,
  Progress,
  Row,
  Segmented,
  Select,
} from "antd";
import { DatabaseOutlined, PercentageOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { message, modal } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import PageHeader from "@/components/common/PageHeader";
import {
  bulkOpeningAction,
  bulkTaxAction,
  countBulkProductsAction,
} from "@/actions/products-bulk.actions";

// ============================================================
// الإدارة ← تعديل جماعي للأصناف (لمالك البرنامج)
// - الضريبة: نسبة الضريبة و/أو «السعر شامل الضريبة» لكل الأصناف
// - الرصيد الافتتاحي: رقم واحد لكل الأصناف (الرئيسي افتراضياً، أو مستودع تاني) على دفعات
// لكل واحدة: قسم معيّن أو الكل + «اللي قيمتها صفر بس»، وتأكيد بعدد الأصناف قبل التنفيذ
// ============================================================
export default function ProductsBulkView({
  categories,
  defaultTaxRate,
  warehouses = [],
}) {
  const t = useTranslations("ProductsBulk");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const router = useRouter();
  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName);

  const categoryOptions = categories.map((c) => ({ value: c.id, label: nameOf(c) }));

  // ---------------- الضريبة ----------------
  const [tax, setTax] = useState({
    categoryId: null,
    onlyEmpty: false,
    taxRate: defaultTaxRate,
    includeTax: "keep",
  });
  const [taxBusy, setTaxBusy] = useState(false);

  // ---------------- الرصيد الافتتاحي ----------------
  // المستودع: الرئيسي افتراضياً
  const mainId =
    warehouses.find((w) => w.isMain)?.id ?? warehouses[0]?.id ?? null;
  const [opening, setOpening] = useState({
    categoryId: null,
    onlyEmpty: true,
    qty: null,
    warehouseId: mainId,
  });
  const [progress, setProgress] = useState(null); // { done, total }

  // عدد الأصناف اللي هتتعدل ← تأكيد ← التنفيذ
  const confirmFor = async (op, scope, onOk) => {
    const res = await countBulkProductsAction({ op, ...scope });
    if (!res.success) return showActionError(res, tAlerts, locale);
    if (!res.data) return message.warning(t("NoProducts"));
    modal.confirm({
      title: t("ConfirmTitle", { count: res.data }),
      content: t("ConfirmHint"),
      okText: t("Apply"),
      onOk: () => onOk(res.data),
    });
  };

  const applyTax = async () => {
    const includeTax = tax.includeTax === "keep" ? null : tax.includeTax === "yes";
    if (tax.taxRate == null && includeTax == null)
      return message.warning(t("BulkNothingToChange"));
    const scope = { categoryId: tax.categoryId, onlyEmpty: tax.onlyEmpty };
    setTaxBusy(true);
    await confirmFor("tax", scope, async () => {
      const res = await bulkTaxAction({ ...scope, taxRate: tax.taxRate, includeTax });
      if (!res.success) return showActionError(res, tAlerts, locale);
      message.success(t("Done", { count: res.data.updated }));
      router.refresh();
    });
    setTaxBusy(false);
  };

  const applyOpening = async () => {
    if (opening.qty == null) return message.warning(t("QtyRequired"));
    const scope = {
      categoryId: opening.categoryId,
      onlyEmpty: opening.onlyEmpty,
      warehouseId: opening.warehouseId,
    };
    await confirmFor("opening", scope, async (total) => {
      setProgress({ done: 0, total });
      let afterId = 0;
      let done = 0;
      // على دفعات (كل دفعة 300 صنف) عشان الأعداد الكبيرة
      for (;;) {
        const res = await bulkOpeningAction({ ...scope, qty: opening.qty, afterId });
        if (!res.success) {
          setProgress(null);
          return showActionError(res, tAlerts, locale);
        }
        done += res.data.done;
        afterId = res.data.lastId;
        setProgress({ done, total });
        if (res.data.finished) break;
      }
      setProgress(null);
      message.success(t("Done", { count: done }));
      router.refresh();
    });
  };

  // النطاق: القسم + «اللي قيمتها صفر بس»
  const scopeFields = (state, setState, emptyLabel) => (
    <>
      <Col xs={24} md={12}>
        <Form.Item label={t("Category")}>
          <Select
            allowClear
            showSearch={{ optionFilterProp: "label" }}
            placeholder={t("AllCategories")}
            value={state.categoryId ?? undefined}
            onChange={(v) => setState((s) => ({ ...s, categoryId: v ?? null }))}
            options={categoryOptions}
          />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label=" " colon={false}>
          <Checkbox
            checked={state.onlyEmpty}
            onChange={(e) => setState((s) => ({ ...s, onlyEmpty: e.target.checked }))}
          >
            {emptyLabel}
          </Checkbox>
        </Form.Item>
      </Col>
    </>
  );

  return (
    <div>
      <PageHeader title={t("Title")} />
      <Alert type="warning" showIcon className="mb-4" title={t("Warning")} />
      <Row gutter={[16, 16]}>
        {/* الضريبة */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <span>
                <PercentageOutlined style={{ marginInlineEnd: 8 }} />
                {t("TaxTitle")}
              </span>
            }
            className="h-full"
          >
            <Form layout="vertical" autoComplete="off" className="cp-compact-form">
              <Row gutter={[16, 0]}>
                {scopeFields(tax, setTax, t("OnlyZeroTax"))}
                <Col xs={24} md={12}>
                  <Form.Item label={t("TaxRate")} tooltip={t("TaxRateHint")}>
                    <InputNumber
                      min={0}
                      max={100}
                      suffix="%"
                      placeholder={t("NoChange")}
                      value={tax.taxRate}
                      onChange={(v) => setTax((s) => ({ ...s, taxRate: v }))}
                      style={{ width: "100%" }}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label={t("IncludeTax")} tooltip={t("IncludeTaxHint")}>
                    <Segmented
                      block
                      value={tax.includeTax}
                      onChange={(v) => setTax((s) => ({ ...s, includeTax: v }))}
                      options={[
                        { value: "keep", label: t("NoChange") },
                        { value: "yes", label: t("Inclusive") },
                        { value: "no", label: t("Exclusive") },
                      ]}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Button type="primary" loading={taxBusy} onClick={applyTax}>
                {t("Apply")}
              </Button>
            </Form>
          </Card>
        </Col>

        {/* الرصيد الافتتاحي */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <span>
                <DatabaseOutlined style={{ marginInlineEnd: 8 }} />
                {t("OpeningTitle")}
              </span>
            }
            className="h-full"
          >
            <Form layout="vertical" autoComplete="off" className="cp-compact-form">
              <Row gutter={[16, 0]}>
                {scopeFields(opening, setOpening, t("OnlyZeroOpening"))}
                {warehouses.length > 1 && (
                  <Col xs={24} md={12}>
                    <Form.Item label={t("Warehouse")} tooltip={t("WarehouseHint")}>
                      <Select
                        value={opening.warehouseId ?? undefined}
                        onChange={(v) =>
                          setOpening((s) => ({ ...s, warehouseId: v }))
                        }
                        options={warehouses.map((w) => ({
                          value: w.id,
                          label: nameOf(w),
                        }))}
                      />
                    </Form.Item>
                  </Col>
                )}
                <Col xs={24} md={12}>
                  <Form.Item label={t("OpeningQty")} tooltip={t("OpeningHint")}>
                    <InputNumber
                      min={0}
                      max={1_000_000}
                      precision={3}
                      value={opening.qty}
                      onChange={(v) => setOpening((s) => ({ ...s, qty: v }))}
                      style={{ width: "100%" }}
                    />
                  </Form.Item>
                </Col>
              </Row>
              {progress && (
                <Progress
                  className="mb-3"
                  percent={Math.round((progress.done / Math.max(progress.total, 1)) * 100)}
                  format={() => `${progress.done} / ${progress.total}`}
                />
              )}
              <Button type="primary" loading={Boolean(progress)} onClick={applyOpening}>
                {t("Apply")}
              </Button>
            </Form>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
