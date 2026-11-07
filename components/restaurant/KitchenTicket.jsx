"use client";

import { formatDateTime } from "@/lib/dates";
import { PRINT_AREA } from "@/components/printing/invoice/InvoiceView";
import "./restaurant-ticket.css";

// ============================================================
// تذكرة المطبخ (كاشير 80/58mm): رقم الطلب كبير + نوعه + الطاولة
// السطور: العدد × الصنف + الحجم والإضافات والملاحظة (من غير أسعار)
// added: إضافة على طاولة مفتوحة (الجديد بس)
// ============================================================
// paperSize: 80mm / 58mm ← عرض الطباعة الفعلي (من غيره المستند بياخد عرض الشاشة والطابعة بتصغّره)
export default function KitchenTicket({ ticket, labels, paperSize = "80mm" }) {
  return (
    <div
      className="kt"
      dir="rtl"
      style={{ width: `${PRINT_AREA[paperSize] ?? 72}mm` }}
    >
      <div className="kt__head">
        <span className="kt__no">#{ticket.dailyNo}</span>
        <span className="kt__type">
          {labels.types[ticket.orderType]}
          {ticket.tableNo ? ` · ${labels.table} ${ticket.tableNo}` : ""}
          {ticket.channelName ? ` · ${ticket.channelName}` : ""}
        </span>
      </div>
      {/* اسم طابعة التحضير (لما التذكرة بتتقسم على أكتر من طابعة) */}
      {ticket.printerName && <div className="kt__printer">{ticket.printerName}</div>}
      {ticket.added && <div className="kt__added">{labels.added}</div>}
      <div className="kt__date">{formatDateTime(ticket.at)}</div>
      <div className="kt__lines">
        {ticket.lines.map((l, i) => (
          <div key={i} className="kt__line">
            <span className="kt__qty">{l.qty} ×</span>
            <span>
              <b>{l.name}</b>
              {l.note && <div className="kt__note">{l.note}</div>}
            </span>
          </div>
        ))}
      </div>
      {ticket.notes && <div className="kt__notes">{ticket.notes}</div>}
    </div>
  );
}
