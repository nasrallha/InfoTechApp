"use client";

import { Modal } from "antd";
import {
  FireOutlined,
  AppstoreOutlined,
  CalendarOutlined,
  LineChartOutlined,
  PieChartOutlined,
  PercentageOutlined,
  SafetyCertificateOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  ShoppingOutlined,
} from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { useStaffWords } from "@/components/technicians/useStaffT";
import { useRouter } from "@/i18n/routing";
import { useCan, useModule } from "@/components/auth/AuthProvider";
import { C } from "@/lib/theme";
import "@/components/invoices/invoices.css";

// التقارير: الرابط + الأيقونة + اللون + الصلاحية
export const REPORTS = [
  {
    key: "profit",
    href: "/reports/profit",
    Icon: LineChartOutlined,
    color: C.successText,
    permission: "reports.profit",
  },
  {
    key: "daily",
    href: "/reports/daily",
    Icon: CalendarOutlined,
    color: C.warningText,
    permission: "reports.daily",
  },
  {
    key: "sales",
    href: "/reports/sales",
    Icon: ShoppingCartOutlined,
    color: C.primary,
    permission: "reports.sales",
  },
  {
    key: "purchases",
    href: "/reports/purchases",
    Icon: ShoppingOutlined,
    color: C.infoText,
    permission: "reports.purchases",
  },
  {
    key: "vat",
    href: "/reports/vat",
    Icon: PercentageOutlined,
    color: C.purple,
    permission: "reports.vat",
  },
  // الأرقام التسلسلية (وحدة serials)
  {
    key: "warranties",
    href: "/reports/warranties",
    Icon: SafetyCertificateOutlined,
    color: C.warningText,
    permission: "serials.warranties",
  },
  // المقاسات والألوان (وحدة variants): المبيعات والرصيد بالموديل
  {
    key: "models",
    href: "/reports/models",
    Icon: AppstoreOutlined,
    color: C.accent,
    permission: "reports.sales",
    module: "variants",
  },
  // التبغ (وحدة restaurant): أصناف التبغ ورسوم التبغ
  {
    key: "tobacco",
    href: "/reports/tobacco",
    Icon: FireOutlined,
    color: C.warningText,
    permission: "reports.sales",
    module: "restaurant",
  },
  // عمولات الفنيين (وحدة technicians)
  {
    key: "commissions",
    href: "/reports/commissions",
    Icon: TeamOutlined,
    color: C.purple,
    permission: "technicians.commissions",
  },
];

const REAL_ESTATE_HIDDEN = ["profit", "daily", "sales", "purchases", "vat"];

export function useVisibleReports() {
  const can = useCan();
  const variantsOn = useModule("variants");
  const restaurantOn = useModule("restaurant");
  // تأجير العقارات: تقاريره في «تقارير الإيجار»، والربح والضريبة لينكات في مجموعته
  // (فنافذة التقارير بتفضى وزرارها بيختفي)
  const realEstateOn = useModule("realEstate");
  const modules = { variants: variantsOn, restaurant: restaurantOn };
  return REPORTS.filter(
    (r) =>
      can(r.permission) &&
      (!r.module || modules[r.module]) &&
      !(realEstateOn && REAL_ESTATE_HIDDEN.includes(r.key)),
  );
}

// نافذة اختيار التقرير (نفس شكل نافذة الفواتير)
export default function ReportsPicker({ open, onClose }) {
  const t = useTranslations("Reports");
  // اسم مقدم الخدمة (عمولات الفنيين / العاملات / الحلاقين)
  const staff = useStaffWords();
  const router = useRouter();
  const reports = useVisibleReports();

  const go = (href) => {
    onClose();
    router.push(href);
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={760}
      centered
      destroyOnHidden
      title={
        <span>
          <PieChartOutlined style={{ marginInlineEnd: 8 }} />
          {t("ChooseReport")}
        </span>
      }
    >
      <div className="invoice-picker">
        {reports.map(({ key, href, Icon, color }) => (
          <button
            key={key}
            type="button"
            className="invoice-picker__item"
            style={{ "--accent": color }}
            onClick={() => go(href)}
          >
            <span className="invoice-picker__icon">
              <Icon />
            </span>
            <span className="invoice-picker__title">
              {t(`names.${key}`, staff)}
            </span>
            <span className="invoice-picker__hint">
              {t(`hints.${key}`, staff)}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
