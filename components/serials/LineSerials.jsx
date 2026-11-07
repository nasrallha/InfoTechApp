"use client";

import { useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  Tag,
} from "antd";
import {
  DeleteOutlined,
  NumberOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { useModule, useModuleSettings } from "@/components/auth/AuthProvider";
import { C } from "@/lib/theme";

// ============================================================
// الأرقام التسلسلية والضمان لسطر في فاتورة البيع أو الكاشير (وحدة serials)
// line: { serialCount, serialLabel1, serialLabel2, warrantyMonths, serials[] ... }
// factor: عامل تحويل وحدة السطر (عدد القطع = الكمية × العامل)
// onChange({ serials, warrantyMonths })
// open / onOpenChange: اختياري (الكاشير بيفتحها أول ما الصنف يتضاف)
// ============================================================

// عدد القطع المطلوب أرقامها في السطر
export const piecesOf = (line, factor = 1) =>
  Math.round(Number(line.qty || 0) * Number(factor || 1) * 1000) / 1000;

// السطر ناقصه أرقام؟ (الإلزام مفعّل بس)
export const serialsShort = (line, factor, required) =>
  required &&
  line.serialCount > 0 &&
  (line.serials?.length ?? 0) < piecesOf(line, factor);

// الرقم ده موجود في سطور الفاتورة بالفعل؟ (المسح مرتين)
export const serialInLines = (lines, productId, serial) =>
  lines.some(
    (l) =>
      l.productId === productId &&
      (l.serials ?? []).some(
        (s) => s.serial.toLowerCase() === serial.toLowerCase(),
      ),
  );

export default function LineSerials({
  line,
  factor = 1,
  onChange,
  open: openProp,
  onOpenChange,
  disabled = false,
  // الشراء: من غير ضمان، والإدخال اختياري دايمًا
  withWarranty = true,
  optional = false,
}) {
  const t = useTranslations("Serials");
  const serialsOn = useModule("serials");
  const settings = useModuleSettings();
  const serialRequired = optional ? false : (settings.serialRequired ?? true);
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (v) => (onOpenChange ? onOpenChange(v) : setOpenState(v));

  if (!serialsOn) return null;
  const tracked = line.serialCount > 0;
  const months = withWarranty ? (line.warrantyMonths ?? 0) : 0;
  if (!tracked && !(months > 0)) return null;

  const pieces = piecesOf(line, factor);
  const count = line.serials?.length ?? 0;
  const complete = count >= pieces;
  const color = !tracked
    ? "default"
    : complete
      ? "green"
      : serialRequired
        ? "red"
        : "orange";

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      <Tag
        color={color}
        icon={tracked ? <NumberOutlined /> : <SafetyCertificateOutlined />}
        style={{ cursor: disabled ? "default" : "pointer" }}
        onClick={disabled ? undefined : () => setOpen(true)}
      >
        {tracked
          ? t("CountOf", {
              count,
              total: Number.isInteger(pieces) ? pieces : "?",
            })
          : t("Warranty")}
        {months > 0 ? ` · ${t("MonthsN", { n: months })}` : ""}
      </Tag>
      {open && (
        <SerialsModal
          line={line}
          pieces={pieces}
          required={serialRequired}
          withWarranty={withWarranty}
          onClose={() => setOpen(false)}
          onSave={(v) => {
            onChange?.(v);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SerialsModal({
  line,
  pieces,
  required,
  withWarranty,
  onClose,
  onSave,
}) {
  const t = useTranslations("Serials");
  const tButtons = useTranslations("Buttons");
  const locale = useLocale();
  const two = line.serialCount === 2;
  const tracked = line.serialCount > 0;
  const label1 = line.serialLabel1 || t("DefaultLabel1");
  const label2 = line.serialLabel2 || t("DefaultLabel2");
  const [rows, setRows] = useState(() =>
    (line.serials ?? []).map((s, i) => ({ ...s, key: `r${i}` })),
  );
  const [months, setMonths] = useState(line.warrantyMonths ?? 0);
  const [v1, setV1] = useState("");
  const [v2, setV2] = useState("");
  const ref1 = useRef(null);
  const ref2 = useRef(null);
  const seq = useRef(rows.length);
  const wholePieces = Number.isInteger(pieces);

  const exists = (v) =>
    rows.some(
      (r) =>
        r.serial.toLowerCase() === v.toLowerCase() ||
        (r.serial2 ?? "").toLowerCase() === v.toLowerCase(),
    );

  const add = () => {
    const a = v1.trim();
    const b = two ? v2.trim() : "";
    if (!a) return ref1.current?.focus();
    if (two && required && !b) return ref2.current?.focus();
    if (exists(a) || (b && exists(b)) || (b && a === b))
      return message.warning(t("DuplicateInList"));
    if (wholePieces && rows.length >= pieces)
      return message.warning(t("AllEntered"));
    setRows((prev) => [
      ...prev,
      {
        key: `r${++seq.current}`,
        serial: a,
        serial2: b || null,
        isUsed: false,
      },
    ]);
    setV1("");
    setV2("");
    setTimeout(() => ref1.current?.focus(), 0);
  };

  const save = () =>
    onSave({
      serials: rows.map(({ serial, serial2, isUsed }) => ({
        serial,
        serial2: serial2 ?? null,
        isUsed: Boolean(isUsed),
      })),
      ...(withWarranty ? { warrantyMonths: months ?? 0 } : {}),
    });

  const name = locale === "ar" ? line.arName : line.enName;

  return (
    <Modal
      open
      title={`${tracked ? t("ModalTitle") : t("Warranty")} — ${name}`}
      onCancel={onClose}
      onOk={save}
      okText={t("Done")}
      width={tracked ? 640 : 380}
      destroyOnHidden
    >
      <Space wrap className="mb-3" align="center">
        {withWarranty && (
          <>
            <span>{t("WarrantyMonths")}:</span>
            <InputNumber
              min={0}
              max={600}
              precision={0}
              value={months}
              onChange={(v) => setMonths(v ?? 0)}
              style={{ width: 110 }}
            />
          </>
        )}
        {tracked && (
          <Tag color={rows.length >= pieces ? "green" : "orange"}>
            {t("CountOf", {
              count: rows.length,
              total: wholePieces ? pieces : "?",
            })}
          </Tag>
        )}
      </Space>

      {tracked && (
        <>
          {!wholePieces && (
            <Alert
              type="warning"
              showIcon
              className="mb-3"
              title={t("WholeQtyOnly")}
            />
          )}
          <Space.Compact style={{ width: "100%" }} className="mb-3">
            <Input
              ref={ref1}
              autoFocus
              value={v1}
              placeholder={label1}
              onChange={(e) => setV1(e.target.value)}
              onPressEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (two && !v2.trim() && v1.trim()) ref2.current?.focus();
                else add();
              }}
            />
            {two && (
              <Input
                ref={ref2}
                value={v2}
                placeholder={label2}
                onChange={(e) => setV2(e.target.value)}
                onPressEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  add();
                }}
              />
            )}
            <Button aria-label={tButtons("Add")} title={tButtons("Add")} type="primary" icon={<PlusOutlined />} onClick={add} />
          </Space.Compact>
          <div style={{ fontSize: 12, color: C.muted }} className="mb-2">
            {t("ScanHint")}
          </div>
          <Table
            size="small"
            rowKey="key"
            pagination={false}
            scroll={{ y: 260 }}
            dataSource={rows}
            locale={{ emptyText: t("NoneYet") }}
            columns={[
              {
                title: "#",
                key: "i",
                width: 45,
                render: (_, __, i) => i + 1,
              },
              {
                title: label1,
                dataIndex: "serial",
                render: (v) => <bdi>{v}</bdi>,
              },
              ...(two
                ? [
                    {
                      title: label2,
                      dataIndex: "serial2",
                      render: (v) => <bdi>{v ?? "—"}</bdi>,
                    },
                  ]
                : []),
              {
                title: t("Used"),
                key: "used",
                width: 80,
                align: "center",
                render: (_, r) => (
                  <Checkbox
                    checked={Boolean(r.isUsed)}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((x) =>
                          x.key === r.key
                            ? { ...x, isUsed: e.target.checked }
                            : x,
                        ),
                      )
                    }
                  />
                ),
              },
              {
                title: "",
                key: "del",
                width: 50,
                render: (_, r) => (
                  <Button
                    danger
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() =>
                      setRows((prev) => prev.filter((x) => x.key !== r.key))
                    }
                  />
                ),
              },
            ]}
          />
        </>
      )}
    </Modal>
  );
}
