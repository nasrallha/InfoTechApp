"use client";

import { useState } from "react";
import { Button, Input, InputNumber, Modal, Space, Table, Tag } from "antd";
import {
  DeleteOutlined,
  HourglassOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useTranslations } from "next-intl";
import DayPicker from "@/components/common/DayPicker";
import { formatDay, today } from "@/lib/dates";

const round3 = (v) => Math.round((Number(v) || 0) * 1000) / 1000;
export const batchesTotal = (batches) =>
  round3((batches ?? []).reduce((s, b) => s + (Number(b.qty) || 0), 0));

// الدفعات مكتملة: كلها ليها انتهاء، ومجموعها = كمية السطر
export const batchesComplete = (line) =>
  !line.trackExpiry ||
  ((line.batches ?? []).length > 0 &&
    line.batches.every((b) => b.expDate && Number(b.qty) > 0) &&
    batchesTotal(line.batches) === round3(line.qty));

// ============================================================
// دفعات سطر (الصنف المتتبع بالصلاحية) في الشراء / الزيادات
// line: { trackExpiry, qty, batches: [{ batchNo, mfgDate, expDate, qty }] }
// onChange({ batches })
// - دفعة واحدة بكمية السطر كلها هي الأشهر: بتتكتب على طول
// - التقسيم: لو نفس الصنف جه بأكتر من تاريخ انتهاء
// ============================================================
export default function LineBatches({ line, onChange }) {
  const t = useTranslations("Batches");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  if (!line.trackExpiry) return null;

  const list = line.batches ?? [];
  const ok = batchesComplete(line);

  const openModal = () => {
    setRows(
      list.length
        ? list.map((b, i) => ({ ...b, key: i }))
        : [
            {
              key: 0,
              batchNo: "",
              mfgDate: null,
              expDate: null,
              qty: Number(line.qty) || 0,
            },
          ],
    );
    setOpen(true);
  };
  const set = (key, patch) =>
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  const total = batchesTotal(rows);
  const rowsOk =
    rows.length > 0 &&
    rows.every((r) => r.expDate && Number(r.qty) > 0) &&
    total === round3(line.qty);

  const save = () => {
    onChange({
      batches: rows.map((r) => ({
        batchNo: r.batchNo?.trim() || null,
        mfgDate: r.mfgDate || null,
        expDate: r.expDate,
        qty: round3(r.qty),
      })),
    });
    setOpen(false);
  };

  return (
    <div className="pur-line__code">
      <Button
        size="small"
        type="link"
        danger={!ok}
        icon={<HourglassOutlined />}
        onClick={openModal}
        style={{ paddingInline: 0 }}
      >
        {list.length === 1 && list[0].expDate
          ? `${t("Expiry")}: ${formatDay(list[0].expDate)}${list[0].batchNo ? ` — ${list[0].batchNo}` : ""}`
          : list.length > 1
            ? t("BatchesCount", { count: list.length })
            : t("EnterBatches")}
      </Button>
      {!ok && list.length > 0 && <Tag color="red">{t("QtyMismatch")}</Tag>}

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        onOk={save}
        okButtonProps={{ disabled: !rowsOk }}
        title={t("Title")}
        width={760}
        destroyOnHidden
      >
        <p className="text-slate-500 mb-2">
          {t("Hint", { qty: round3(line.qty) })}
        </p>
        <Table
          size="small"
          bordered
          rowKey="key"
          pagination={false}
          dataSource={rows}
          scroll={{ x: 620 }}
          columns={[
            {
              title: t("BatchNo"),
              key: "no",
              width: 150,
              render: (_, r) => (
                <Input
                  size="small"
                  dir="ltr"
                  maxLength={50}
                  placeholder={t("AutoNo")}
                  value={r.batchNo ?? ""}
                  onChange={(e) => set(r.key, { batchNo: e.target.value })}
                />
              ),
            },
            {
              title: t("MfgDate"),
              key: "mfg",
              width: 140,
              render: (_, r) => (
                <DayPicker
                  size="small"
                  allowClear
                  max={today()}
                  value={r.mfgDate}
                  onChange={(v) => set(r.key, { mfgDate: v ?? null })}
                />
              ),
            },
            {
              title: (
                <span>
                  {t("ExpDate")} <span className="text-red-500">*</span>
                </span>
              ),
              key: "exp",
              width: 140,
              render: (_, r) => (
                <DayPicker
                  size="small"
                  allowClear
                  status={r.expDate ? undefined : "error"}
                  value={r.expDate}
                  onChange={(v) => set(r.key, { expDate: v ?? null })}
                />
              ),
            },
            {
              title: t("Qty"),
              key: "qty",
              width: 110,
              render: (_, r) => (
                <InputNumber
                  size="small"
                  min={0}
                  precision={3}
                  controls={false}
                  style={{ width: "100%" }}
                  value={r.qty}
                  onChange={(v) => set(r.key, { qty: v ?? 0 })}
                />
              ),
            },
            {
              title: "",
              key: "del",
              width: 45,
              align: "center",
              render: (_, r) => (
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  disabled={rows.length === 1}
                  onClick={() =>
                    setRows((prev) => prev.filter((x) => x.key !== r.key))
                  }
                />
              ),
            },
          ]}
        />
        <Space className="mt-2" wrap>
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() =>
              setRows((prev) => [
                ...prev,
                {
                  key: Math.max(0, ...prev.map((x) => x.key)) + 1,
                  batchNo: "",
                  mfgDate: null,
                  expDate: null,
                  qty: Math.max(0, round3(line.qty) - total),
                },
              ])
            }
          >
            {t("AddBatch")}
          </Button>
          <Tag color={total === round3(line.qty) ? "green" : "red"}>
            {t("Total")}: {total} / {round3(line.qty)}
          </Tag>
        </Space>
      </Modal>
    </div>
  );
}
