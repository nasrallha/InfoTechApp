"use client";

import { useRouter } from "@/i18n/routing";
import EditCertificateModal from "./EditCertificateModal";

// ============================================================
// «تعديل» فاتورة مستخلص من شاشة الفواتير: تعديل الفاتورة (السداد والملاحظات) بنفس رقمها
// وأرقام المستخلص (الأعمال والاسترداد والضريبة والضمان والصافي) للعرض
// (تعديل المستخلص نفسه: من شاشة العقد / تقرير المستخلصات)
// backHref: صفحة الفاتورة (بعد الحفظ أو الإلغاء)
// ============================================================
export default function CertificateInvoiceEdit({ certId, backHref, methods = [], units = [] }) {
  const router = useRouter();
  const back = () => router.push(backHref);
  // بعد الحفظ: صفحة الفاتورة بالبيانات الجديدة (مش من الكاش)
  const done = () => {
    router.push(backHref);
    router.refresh();
  };
  return <EditCertificateModal invoiceMode certId={certId} methods={methods} units={units} onClose={back} onDone={done} />;
}
