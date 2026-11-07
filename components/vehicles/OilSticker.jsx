"use client";

import { useState } from "react";
import { Button, Dropdown, Space } from "antd";
import { DownOutlined, TagOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { dayOf, dbDateToDay, formatDay } from "@/lib/dates";
import { imageUrl } from "@/lib/image";
import PrintDocument from "@/components/printing/PrintDocument";

// ============================================================
// ستيكر تغيير الزيت (بيتلزق على زجاج السيارة) - خدمة اختيارية:
// الزرار بيظهر بس لفاتورة على سيارة فيها سطر "الغيار القادم"
// بيتطبع على طابعة الكاشير (80mm / 58mm) بالعربي والإنجليزي
// ============================================================
export const stickerLines = (sale) =>
  (sale?.items ?? []).filter(
    (l) =>
      (l.nextKm != null || l.nextDate) &&
      Number(l.returnedQty ?? 0) < Number(l.qty) - 1e-9,
  );

export default function OilStickerButton({ sale, company }) {
  const t = useTranslations("Vehicles");
  const [paper, setPaper] = useState(null);
  const lines = stickerLines(sale);
  if (sale?.type !== "sale" || !sale.vehiclePlate || !lines.length) return null;

  return (
    <>
      <Space.Compact>
        {/* لون مميز (برتقالي الزيت) عشان يبان جنب أزرار الفاتورة */}
        <Button
          color="orange"
          variant="solid"
          icon={<TagOutlined />}
          onClick={() => setPaper("80mm")}
        >
          {t("OilSticker")}
        </Button>
        <Dropdown
          trigger={["click"]}
          menu={{
            items: [
              { key: "80mm", label: "80mm" },
              { key: "58mm", label: "58mm" },
            ],
            onClick: ({ key }) => setPaper(key),
          }}
        >
          <Button
            color="orange"
            variant="solid"
            icon={<DownOutlined />}
            aria-label="paper"
          />
        </Dropdown>
      </Space.Compact>
      {paper && (
        <PrintDocument paperSize={paper} onDone={() => setPaper(null)}>
          <OilSticker
            sale={sale}
            company={company}
            lines={lines}
            narrow={paper === "58mm"}
          />
        </PrintDocument>
      )}
    </>
  );
}

function OilSticker({ sale, company, lines, narrow }) {
  const km = (v) => Number(v).toLocaleString("en");
  // أقرب غيار (لو فيه أكتر من صنف: زيت + فلتر)
  const nextKm = lines
    .map((l) => l.nextKm)
    .filter((v) => v != null)
    .sort((a, b) => a - b)[0];
  const nextDay = lines
    .map((l) => (l.nextDate ? dbDateToDay(l.nextDate) : null))
    .filter(Boolean)
    .sort()[0];
  const box = {
    border: "2px solid #000",
    borderRadius: 6,
    padding: "2mm",
    margin: "1.5mm 0",
    textAlign: "center",
  };
  const big = { fontSize: narrow ? 16 : 20, fontWeight: 800 };
  const label = { fontSize: narrow ? 9 : 10, fontWeight: 700 };

  return (
    <div
      dir="rtl"
      style={{
        width: narrow ? "48mm" : "72mm",
        fontFamily: "var(--font-main), Tahoma, Arial, sans-serif",
        color: "#000",
        fontSize: narrow ? 10 : 11,
        lineHeight: 1.35,
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "1mm" }}>
        {company?.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl(company.logo)}
            alt=""
            style={{
              maxHeight: "12mm",
              maxWidth: "40mm",
              objectFit: "contain",
            }}
          />
        )}
        <div style={{ fontWeight: 800, fontSize: narrow ? 12 : 14 }}>
          {company?.arName}
        </div>
        {(sale.branch?.phone || company?.phone) && (
          <bdi>{sale.branch?.phone || company?.phone}</bdi>
        )}
      </div>

      <div style={{ ...box, background: "#000", color: "#fff" }}>
        <div style={{ fontWeight: 800, fontSize: narrow ? 13 : 15 }}>
          تغيير الزيت · OIL CHANGE
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={label}>اللوحة / Plate</span>
        <b dir="ltr" style={{ letterSpacing: 1 }}>
          {sale.vehiclePlate}
        </b>
      </div>
      {sale.vehicleType && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={label}>السيارة / Car</span>
          <span>{sale.vehicleType}</span>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={label}>التاريخ / Date</span>
        <bdi>{formatDay(dayOf(sale.date))}</bdi>
      </div>
      {sale.odometer != null && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={label}>العداد / Odometer</span>
          <bdi>{km(sale.odometer)} km</bdi>
        </div>
      )}
      <div style={{ margin: "1mm 0" }}>
        {lines.map((l) => (
          <div key={l.id} style={{ fontSize: narrow ? 9 : 10 }}>
            • {l.arName}
          </div>
        ))}
      </div>

      <div style={box}>
        <div style={label}>الغيار القادم · NEXT CHANGE</div>
        {nextKm != null && (
          <div style={big}>
            <bdi>{km(nextKm)} km</bdi>
          </div>
        )}
        {nextKm != null && nextDay && (
          <div style={{ fontSize: 10 }}>أو / or</div>
        )}
        {nextDay && (
          <div style={big}>
            <bdi>{formatDay(nextDay)}</bdi>
          </div>
        )}
        <div style={{ fontSize: 9 }}>أيهما أقرب · whichever comes first</div>
      </div>
    </div>
  );
}
