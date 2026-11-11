"use client";

import { useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Col,
  Modal,
  Progress,
  Radio,
  Result,
  Row,
  Select,
  Space,
  Statistic,
  Steps,
  Switch,
  Table,
  Tooltip,
  Upload,
} from "antd";
import {
  DownloadOutlined,
  FileExcelOutlined,
  ImportOutlined,
  InboxOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { useCan } from "@/components/auth/AuthProvider";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import {
  importCheckAction,
  importRunAction,
  importSetupAction,
} from "@/actions/import.actions";
import {
  CHECK_CHUNK,
  IMPORT_MAX_ROWS,
  RUN_CHUNK,
  cellText,
  normHeader,
} from "@/lib/import-fields";
import { excelSerialToDay, readSheet, writeWorkbook } from "@/lib/import-excel";
import { C } from "@/lib/theme";

// ============================================================
// الاستيراد من Excel: الأصناف / العملاء / الموردين
// 1) الملف: تحميل النموذج أو رفع ملف جاهز + الاختيارات (تحديث الموجود، المستودع، الفروع)
// 2) مطابقة الأعمدة: تلقائي بالاسم، والمستخدم يعدّل
// 3) المراجعة: فحص على السيرفر من غير حفظ (جديد / تحديث / موجود / أخطاء)
// 4) الاستيراد: على دفعات + شريط تقدم، وملف بالأخطاء لتصحيحها وإعادة رفعها
// kind: "products" | "customers" | "suppliers"
// ============================================================

const STATUS_COLOR = {
  new: C.successText,
  update: C.primary,
  skip: C.text2,
  error: C.dangerText,
};

// الحقول اللي التكرار فيها جوه الملف غلط (الباركودات مع بعض)
const DUP_GROUPS = {
  products: [["code", "barcode2", "barcode3"]],
  customers: [["code"], ["phone"], ["taxNo"], ["idNumber"]],
  suppliers: [["code"], ["phone"], ["taxNo"], ["registrationNo"]],
  units: [["arName"], ["enName"]],
  categories: [["arName"], ["enName"]],
};

const chunks = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

export default function ImportButton({ kind }) {
  const t = useTranslations("Import");
  const tAlerts = useTranslations("Alerts");
  const tForm = useTranslations("Form");
  const locale = useLocale();
  const router = useRouter();
  const can = useCan();

  const [open, setOpen] = useState(false);
  const [setup, setSetup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null); // { name, headers, rows }
  const [mapping, setMapping] = useState([]); // لكل عمود: الحقل أو null
  const [options, setOptions] = useState({
    updateExisting: true,
    warehouseId: null,
    allBranches: true,
    branchIds: [],
  });
  const [check, setCheck] = useState(null); // { done, total, results: Map, creates, running }
  const [run, setRun] = useState(null); // { done, total, added, updated, results: Map, running, stopped }
  const cancelRef = useRef(false);

  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName);
  const label = (key) => t(`f_${key}`);
  const fields = useMemo(() => setup?.fields ?? [], [setup]);
  const typeOf = useMemo(
    () => Object.fromEntries(fields.map((f) => [f.key, f.type])),
    [fields],
  );

  // رسالة الخطأ: مفاتيح الاستيراد ثم رسائل البرنامج العامة
  const errText = (code) =>
    t.has(code) ? t(code) : tAlerts.has(code) ? tAlerts(code) : code;

  if (!can(`${kind}.import`)) return null;

  const reset = () => {
    setStep(0);
    setFile(null);
    setMapping([]);
    setCheck(null);
    setRun(null);
  };

  const openModal = async () => {
    reset();
    setOpen(true);
    if (setup) return;
    setLoading(true);
    const res = await importSetupAction({ kind });
    setLoading(false);
    if (!res.success) {
      setOpen(false);
      return showActionError(res, tAlerts, locale);
    }
    setSetup(res.data);
  };

  const close = () => {
    if (check?.running || run?.running) return;
    setOpen(false);
    // اتحفظ حاجة ← الصفحة تتحدث مرة واحدة
    if (run && (run.added || run.updated)) router.refresh();
  };

  // ---------------- النموذج ----------------
  const downloadTemplate = async () => {
    const head = fields.map((f) => `${label(f.key)}${f.required ? " *" : ""}`);
    const hint = (key) =>
      t.has(`hint_${kind}_${key}`)
        ? t(`hint_${kind}_${key}`)
        : t.has(`hint_${key}`)
          ? t(`hint_${key}`)
          : "";
    const help = [
      [t("HelpField"), t("HelpRequired"), t("HelpType"), t("HelpNotes")],
      ...fields.map((f) => [
        label(f.key),
        f.required ? t("Required") : t("Optional"),
        t(`Type_${f.type}`),
        hint(f.key),
      ]),
    ];
    const sheets = [
      {
        name: t("SheetData"),
        header: true,
        rows: [head],
        widths: fields.map((f) => (f.key === "arName" || f.key === "enName" ? 30 : 16)),
        textCols: fields
          .map((f, i) => (f.type === "text" ? i : -1))
          .filter((i) => i >= 0),
      },
      { name: t("SheetHelp"), header: true, rows: help, widths: [24, 12, 22, 70] },
    ];
    // القوائم الموجودة في البرنامج (الأقسام والوحدات) عشان الأسماء تتكتب صح
    if (kind === "products") {
      const n = Math.max(setup.categories.length, setup.units.length);
      const lists = [[t("f_category"), t("f_unit")]];
      for (let i = 0; i < n; i++)
        lists.push([
          setup.categories[i] ? nameOf(setup.categories[i]) : "",
          setup.units[i] ? nameOf(setup.units[i]) : "",
        ]);
      sheets.push({ name: t("SheetLists"), header: true, rows: lists, widths: [30, 20] });
    }
    await writeWorkbook(t(`Template_${kind}`), sheets, locale === "ar");
  };

  // ---------------- قراءة الملف ----------------
  const onFile = async (f) => {
    try {
      const data = await readSheet(f);
      if (!data.rows.length) {
        message.error(t("EmptyFile"));
        return false;
      }
      if (data.rows.length > IMPORT_MAX_ROWS) {
        message.error(
          t("TooManyRows", { count: data.rows.length, max: IMPORT_MAX_ROWS }),
        );
        return false;
      }
      // المطابقة التلقائية: اسم العمود = اسم الحقل أو أي اسم بديل ليه
      const used = new Set();
      const auto = data.headers.map((h) => {
        const n = normHeader(h);
        if (!n) return null;
        const f = fields.find(
          (x) =>
            !used.has(x.key) &&
            [label(x.key), x.key, ...x.aliases].some((a) => normHeader(a) === n),
        );
        if (!f) return null;
        used.add(f.key);
        return f.key;
      });
      setFile({ name: f.name, ...data });
      setMapping(auto);
      setCheck(null);
      setRun(null);
    } catch (e) {
      console.error(e);
      message.error(t("ReadFailed"));
    }
    return false;
  };

  // ---------------- الصفوف للسيرفر ----------------
  const payloadRows = () => {
    const cols = mapping
      .map((key, i) => (key ? [key, i] : null))
      .filter(Boolean);
    const rows = file.rows.map((r) => {
      const v = [];
      for (const [key, i] of cols) {
        let c = r.cells[i];
        if (c === null || c === undefined || c === "") continue;
        if (typeOf[key] === "date" && typeof c === "number") c = excelSerialToDay(c);
        else if (typeof c === "string") c = c.slice(0, 1000);
        else if (typeof c !== "number" && typeof c !== "boolean") c = String(c);
        v.push([key, c]);
      }
      return { r: r.n, v };
    });
    // التكرار جوه الملف كله (السيرفر بيشوف دفعة بس)
    const mark = (row, field) => {
      row.d = [...new Set([...(row.d ?? []), field])];
    };
    for (const group of DUP_GROUPS[kind]) {
      const seen = new Map();
      for (const row of rows)
        for (const [key, val] of row.v) {
          if (!group.includes(key)) continue;
          const k = cellText(val).toLowerCase();
          if (!k) continue;
          if (!seen.has(k)) seen.set(k, []);
          seen.get(k).push([row, key]);
        }
      for (const list of seen.values())
        if (list.length > 1) for (const [row, key] of list) mark(row, key);
    }
    // الصنف: نفس الاسم في نفس القسم مرتين
    if (kind === "products") {
      const seen = new Map();
      for (const row of rows) {
        const get = (k) => cellText(row.v.find((p) => p[0] === k)?.[1]).toLowerCase();
        const name = get("arName");
        if (!name) continue;
        const k = `${get("category")}|${name}`;
        if (!seen.has(k)) seen.set(k, []);
        seen.get(k).push(row);
      }
      for (const list of seen.values())
        if (list.length > 1) for (const row of list) mark(row, "arName");
    }
    return rows;
  };

  const sendOptions = () => ({
    updateExisting: options.updateExisting,
    ...(kind === "products"
      ? { warehouseId: options.warehouseId ?? null }
      : setup.branches
        ? { allBranches: options.allBranches, branchIds: options.branchIds }
        : {}),
  });

  // ---------------- الفحص ----------------
  const runCheck = async () => {
    const rows = payloadRows();
    cancelRef.current = false;
    const results = new Map();
    const creates = { categories: new Set(), units: new Set() };
    setStep(2);
    setCheck({ done: 0, total: rows.length, results, creates, running: true, rows });
    for (const part of chunks(rows, CHECK_CHUNK)) {
      if (cancelRef.current) break;
      const res = await importCheckAction({ kind, rows: part, options: sendOptions() });
      if (!res.success) {
        setCheck((c) => ({ ...c, running: false }));
        return showActionError(res, tAlerts, locale);
      }
      for (const r of res.data.results) results.set(r.row, r);
      res.data.creates.categories.forEach((x) => creates.categories.add(x));
      res.data.creates.units.forEach((x) => creates.units.add(x));
      setCheck((c) => ({ ...c, done: c.done + part.length }));
    }
    setCheck((c) => ({ ...c, running: false }));
  };

  // ---------------- الاستيراد ----------------
  const runImport = async () => {
    const ok = check.rows.filter((r) =>
      ["new", "update"].includes(check.results.get(r.r)?.status),
    );
    if (!ok.length) return message.warning(t("NothingToImport"));
    cancelRef.current = false;
    const results = new Map(check.results);
    setStep(3);
    setRun({ done: 0, total: ok.length, added: 0, updated: 0, results, running: true });
    for (const part of chunks(ok, RUN_CHUNK)) {
      if (cancelRef.current) break;
      const res = await importRunAction({ kind, rows: part, options: sendOptions() });
      if (!res.success) {
        setRun((s) => ({ ...s, running: false, stopped: true }));
        return showActionError(res, tAlerts, locale);
      }
      for (const r of res.data.results) results.set(r.row, r);
      setRun((s) => ({
        ...s,
        done: s.done + part.length,
        added: s.added + res.data.added,
        updated: s.updated + res.data.updated,
      }));
    }
    setRun((s) => ({ ...s, running: false, stopped: cancelRef.current }));
  };

  // ---------------- ملف الأخطاء ----------------
  const errorRows = (results) =>
    file.rows
      .map((r) => ({ r, res: results.get(r.n) }))
      .filter((x) => x.res?.status === "error");

  const describe = (res) =>
    res.errors.map((e) => `${label(e.field)}: ${errText(e.code)}`).join(" | ");

  const downloadErrors = async (results) => {
    const list = errorRows(results);
    await writeWorkbook(
      `${t(`Template_${kind}`)} - ${t("ErrorsFile")}`,
      [
        {
          name: t("SheetData"),
          header: true,
          rows: [
            [...file.headers, t("ErrorsColumn")],
            ...list.map(({ r, res }) => [
              ...file.headers.map((_, i) => r.cells[i] ?? null),
              describe(res),
            ]),
          ],
          widths: [...file.headers.map(() => 16), 60],
        },
      ],
      locale === "ar",
    );
  };

  // ---------------- العرض ----------------
  const counts = (results) => {
    const c = { new: 0, update: 0, skip: 0, error: 0 };
    for (const r of results.values()) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  };

  const mappedKeys = new Set(mapping.filter(Boolean));
  const canCheck = mappedKeys.has("arName") || mappedKeys.has("code");

  const fileStep = (
    <div>
      <Alert type="info" showIcon className="mb-3" title={t("TemplateHint")} />
      <Space wrap className="mb-3">
        <Button icon={<DownloadOutlined />} onClick={downloadTemplate} disabled={!setup}>
          {t("DownloadTemplate")}
        </Button>
      </Space>
      <Upload.Dragger
        accept=".xlsx,.xls,.csv"
        maxCount={1}
        showUploadList={false}
        beforeUpload={onFile}
        disabled={!setup}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">{t("Drop")}</p>
        <p className="ant-upload-hint">{t("DropHint", { max: IMPORT_MAX_ROWS })}</p>
      </Upload.Dragger>
      {file && (
        <Alert
          type="success"
          showIcon
          icon={<FileExcelOutlined />}
          className="mt-3"
          title={t("FileInfo", { name: file.name, count: file.rows.length })}
        />
      )}

      {/* الاختيارات */}
      <Row gutter={[16, 12]} className="mt-3" align="middle">
        <Col xs={24} md={8}>
          <Space>
            <Switch
              checked={options.updateExisting}
              onChange={(v) => setOptions((o) => ({ ...o, updateExisting: v }))}
            />
            <span>{t("UpdateExisting")}</span>
            <Tooltip title={t(`UpdateExistingHint_${kind}`)}>
              <QuestionCircleOutlined style={{ color: C.text2 }} />
            </Tooltip>
          </Space>
        </Col>
        {kind === "products" && setup?.warehouses?.length > 1 && (
          <Col xs={24} md={10}>
            <Space wrap>
              <span>{t("StockWarehouse")}</span>
              <Select
                style={{ width: 220 }}
                value={options.warehouseId ?? setup.warehouses.find((w) => w.isMain)?.id}
                onChange={(v) => setOptions((o) => ({ ...o, warehouseId: v }))}
                options={setup.warehouses.map((w) => ({ value: w.id, label: nameOf(w) }))}
              />
            </Space>
          </Col>
        )}
        {kind !== "products" && setup?.branches && (
          <Col xs={24} md={16}>
            <Space wrap>
              <span>{tForm("PartyBranches")}</span>
              <Radio.Group
                optionType="button"
                buttonStyle="solid"
                value={options.allBranches}
                onChange={(e) => setOptions((o) => ({ ...o, allBranches: e.target.value }))}
                options={[
                  { value: true, label: tForm("AllBranches") },
                  { value: false, label: tForm("SomeBranches") },
                ]}
              />
              {options.allBranches === false && (
                <Select
                  mode="multiple"
                  style={{ minWidth: 240 }}
                  placeholder={tForm("ChooseBranches")}
                  optionFilterProp="label"
                  value={options.branchIds}
                  onChange={(v) => setOptions((o) => ({ ...o, branchIds: v }))}
                  options={setup.branches.map((b) => ({ value: b.id, label: nameOf(b) }))}
                />
              )}
            </Space>
          </Col>
        )}
      </Row>
    </div>
  );

  const mapStep = file && (
    <div>
      <Alert type="info" showIcon className="mb-3" title={t("MapHint")} />
      {!canCheck && (
        <Alert type="warning" showIcon className="mb-3" title={t("NameRequiredMap")} />
      )}
      <Table
        size="small"
        bordered
        rowKey="i"
        pagination={false}
        scroll={{ x: 640, y: 420 }}
        dataSource={file.headers.map((h, i) => ({ i, h }))}
        columns={[
          { title: t("ColumnInFile"), dataIndex: "h", width: 200, render: (h) => h || "—" },
          {
            title: t("Sample"),
            key: "s",
            width: 200,
            ellipsis: true,
            render: (_, { i }) =>
              file.rows
                .slice(0, 3)
                .map((r) => r.cells[i])
                .filter((c) => c !== null && c !== undefined && c !== "")
                .join(" ، ") || "—",
          },
          {
            title: t("FieldInProgram"),
            key: "f",
            width: 240,
            render: (_, { i }) => (
              <Select
                allowClear
                showSearch={{ optionFilterProp: "label" }}
                style={{ width: "100%" }}
                placeholder={t("Ignore")}
                value={mapping[i] ?? undefined}
                onChange={(v) =>
                  setMapping((m) => m.map((x, j) => (j === i ? (v ?? null) : x)))
                }
                options={fields.map((f) => ({
                  value: f.key,
                  label: `${label(f.key)}${f.required ? " *" : ""}`,
                  disabled: mapping.includes(f.key) && mapping[i] !== f.key,
                }))}
              />
            ),
          },
        ]}
      />
    </div>
  );

  const statBlock = (results) => {
    const c = counts(results);
    return (
      <Row gutter={[12, 12]} className="mb-3">
        {["new", "update", "skip", "error"].map((k) => (
          <Col xs={12} md={6} key={k}>
            <Statistic
              title={t(`Stat_${k}`)}
              value={c[k] ?? 0}
              styles={{ content: { color: STATUS_COLOR[k] } }}
            />
          </Col>
        ))}
      </Row>
    );
  };

  const errorsTable = (results) => {
    const list = errorRows(results).flatMap(({ r, res }) =>
      res.errors.map((e, j) => ({
        key: `${r.n}-${j}`,
        row: r.n,
        field: label(e.field),
        problem: errText(e.code),
      })),
    );
    if (!list.length) return null;
    return (
      <Table
        size="small"
        bordered
        dataSource={list}
        scroll={{ x: 560 }}
        pagination={{ pageSize: 8, showSizeChanger: false, size: "small" }}
        columns={[
          { title: t("RowNo"), dataIndex: "row", width: 80, align: "center" },
          { title: t("Field"), dataIndex: "field", width: 180 },
          { title: t("Problem"), dataIndex: "problem" },
        ]}
      />
    );
  };

  const checkStep = check && (
    <div>
      {check.running ? (
        <div className="py-6">
          <Progress percent={Math.round((check.done / check.total) * 100)} />
          <div className="text-center text-slate-500">
            {t("Checking", { done: check.done, total: check.total })}
          </div>
        </div>
      ) : (
        <>
          {statBlock(check.results)}
          {check.creates.categories.size > 0 && (
            <Alert
              type="warning"
              showIcon
              className="mb-2"
              title={t("WillCreateCategories", {
                names: [...check.creates.categories].slice(0, 15).join("، "),
              })}
            />
          )}
          {check.creates.units.size > 0 && (
            <Alert
              type="warning"
              showIcon
              className="mb-2"
              title={t("WillCreateUnits", {
                names: [...check.creates.units].slice(0, 15).join("، "),
              })}
            />
          )}
          {errorsTable(check.results)}
        </>
      )}
    </div>
  );

  const runStep = run && (
    <div>
      {run.running ? (
        <div className="py-6">
          <Progress percent={Math.round((run.done / run.total) * 100)} />
          <div className="text-center text-slate-500">
            {t("Importing", { done: run.done, total: run.total })}
          </div>
        </div>
      ) : (
        <>
          <Result
            status={run.stopped ? "warning" : "success"}
            title={run.stopped ? t("Stopped") : t("DoneTitle")}
            subTitle={t("DoneSummary", {
              added: run.added,
              updated: run.updated,
              failed: counts(run.results).error,
            })}
          />
          {errorsTable(run.results)}
        </>
      )}
    </div>
  );

  // ---------------- الأزرار ----------------
  const busy = check?.running || run?.running;
  const footer = (
    <Space wrap>
      {busy && (
        <Button danger onClick={() => (cancelRef.current = true)}>
          {t("Cancel")}
        </Button>
      )}
      {!busy && step === 1 && <Button onClick={() => setStep(0)}>{t("Back")}</Button>}
      {!busy && step === 2 && <Button onClick={() => setStep(1)}>{t("Back")}</Button>}
      {!busy && step >= 2 && counts((run ?? check)?.results ?? new Map()).error > 0 && (
        <Button
          icon={<FileExcelOutlined />}
          onClick={() => downloadErrors((run ?? check).results)}
        >
          {t("DownloadErrors")}
        </Button>
      )}
      {step === 0 && (
        <Button type="primary" disabled={!file} onClick={() => setStep(1)}>
          {t("Next")}
        </Button>
      )}
      {step === 1 && (
        <Button type="primary" disabled={!canCheck} onClick={runCheck}>
          {t("CheckData")}
        </Button>
      )}
      {step === 2 && check && !check.running && (
        <Button
          type="primary"
          icon={<ImportOutlined />}
          disabled={!(counts(check.results).new + counts(check.results).update)}
          onClick={runImport}
        >
          {t("StartImport", {
            count: counts(check.results).new + counts(check.results).update,
          })}
        </Button>
      )}
      {!busy && <Button onClick={close}>{t("Close")}</Button>}
    </Space>
  );

  return (
    <>
      <Button icon={<ImportOutlined />} onClick={openModal}>
        {t("Button")}
      </Button>
      <Modal
        open={open}
        title={t(`Title_${kind}`)}
        width={1000}
        closable={false}
        mask={{ closable: false }}
        onCancel={close}
        footer={footer}
        destroyOnHidden
        loading={loading}
      >
        <div style={{ padding: "12px 4px 0" }}>
          <Steps
            size="small"
            current={step}
            className="mb-4"
            items={[
              { title: t("StepFile") },
              { title: t("StepMap") },
              { title: t("StepCheck") },
              { title: t("StepDone") },
            ]}
          />
          {step === 0 && fileStep}
          {step === 1 && mapStep}
          {step === 2 && checkStep}
          {step === 3 && runStep}
        </div>
      </Modal>
    </>
  );
}
