"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Empty, Popover, Segmented } from "antd";
import {
  BellOutlined,
  CalendarOutlined,
  CarOutlined,
  ClockCircleOutlined,
  FileSyncOutlined,
  HourglassOutlined,
  SafetyCertificateOutlined,
  ShoppingOutlined,
  ScheduleOutlined,
  SyncOutlined,
  ToolOutlined,
  FileDoneOutlined,
  BankOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { useCan } from "@/components/auth/AuthProvider";
import { modal } from "@/components/common/feedback";
import { formatDocNo, saleDocNo } from "@/lib/doc-number";
import { formatDay, TIME_ZONE } from "@/lib/dates";
import { getNotificationsAction } from "@/actions/notification.actions";
import { useStaffWords } from "@/components/technicians/useStaffT";
import { C } from "@/lib/theme";
import "./notifications.css";

const POLL_MS = 2 * 60_000;
const SEEN_KEY = "notif-seen";
const DAILY_KEY = "notif-daily";
const ZATCA_EOD_KEY = "zatca-eod-alert";

// لون وأيقونة كل نوع
const KINDS = {
  job: { color: C.purple, Icon: ToolOutlined },
  visit: { color: C.accent, Icon: ScheduleOutlined },
  contractEnd: { color: C.magenta, Icon: FileSyncOutlined },
  claimLate: { color: C.warning, Icon: ClockCircleOutlined },
  zatca: { color: C.info, Icon: SafetyCertificateOutlined },
  followUp: { color: C.accent, Icon: SyncOutlined },
  oilChange: { color: C.warningText, Icon: CarOutlined },
  booking: { color: C.magenta, Icon: CalendarOutlined },
  restaurantOrder: { color: C.success, Icon: ShoppingOutlined },
  expiry: { color: C.dangerText, Icon: HourglassOutlined },
  // تأجير العقارات: دفعة مستحقة / عقد بيخلص
  rentDue: { color: C.warningText, Icon: FileDoneOutlined },
  rentEnd: { color: C.magenta, Icon: BankOutlined },
};
const LEVEL_COLORS = { overdue: C.dangerText, today: C.warningText, soon: C.info };
// الفلاتر جوه القايمة
const TABS = {
  all: () => true,
  jobs: (i) => i.kind === "job" || i.kind === "visit",
  followUps: (i) => i.kind === "followUp",
  oil: (i) => i.kind === "oilChange",
  bookings: (i) => i.kind === "booking",
  orders: (i) => i.kind === "restaurantOrder",
  contracts: (i) => i.kind === "contractEnd",
  claims: (i) => i.kind === "claimLate",
  zatca: (i) => i.kind === "zatca",
  expiry: (i) => i.kind === "expiry",
  rent: (i) => i.kind === "rentDue" || i.kind === "rentEnd",
};

// اليوم والوقت الحالي بتوقيت السعودية
function riyadhNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}
const timeOf = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});
const dayOfTime = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// تخزين المتصفح (ممكن يكون مقفول)
function readStore(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // التخزين مش متاح
  }
}

// ============================================================
// جرس الإشعارات الموحد (زي فيسبوك):
// الزكاة + مواعيد التركيب + زيارات العقود + العقود اللي قربت تخلص
// + طلبات الضمان المتأخرة عند الوكيل - كل نوع حسب صلاحية المستخدم
// - الرقم الأحمر = الإشعارات الجديدة اللي لسه ما اتشافتش
// - تذكير مرة في اليوم بمواعيد النهارده والمتأخر
// ============================================================
export default function NotificationBell() {
  const t = useTranslations("Notifications");
  const tZ = useTranslations("Zatca");
  // اسم مقدم الخدمة حسب النشاط (الفني / العاملة / الحلاق ...)
  const staff = useStaffWords();
  const locale = useLocale();
  const router = useRouter();
  const can = useCan();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("all");
  const [seen, setSeen] = useState(() => new Set(readStore(SEEN_KEY, [])));

  const load = useCallback(async () => {
    const res = await getNotificationsAction();
    if (res.success) setData(res.data);
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // إشعارات الزكاة بنفس شكل الباقي
  const items = useMemo(() => {
    if (!data) return [];
    const branchName = (b) => (locale === "ar" ? b.arName : b.enName);
    const z = data.zatca;
    const zatca = z
      ? [
          !z.gatewayOnline && ["gw", tZ("bell.gateway"), null, "overdue"],
          z.overdue > 0 && [
            "overdue",
            tZ("bell.overdue"),
            z.overdue,
            "overdue",
          ],
          z.rejected > 0 && [
            "rejected",
            tZ("bell.rejected"),
            z.rejected,
            "overdue",
          ],
          z.unsigned > 0 && [
            "unsigned",
            tZ("bell.unsigned"),
            z.unsigned,
            "overdue",
          ],
          z.errors > 0 && ["errors", tZ("bell.errors"), z.errors, "today"],
          z.pending > 0 && ["pending", tZ("bell.pending"), z.pending, "soon"],
          ...z.expiring.map((e, i) => [
            `cert${i}-${e.days}`,
            tZ("bell.cert", { branch: branchName(e.branch), days: e.days }),
            null,
            e.days <= 7 ? "overdue" : "soon",
          ]),
        ]
          .filter(Boolean)
          .map(([k, label, count, level]) => ({
            // العدد جزء من المفتاح: لو زاد يرجع جديد
            key: `zatca-${k}-${count ?? ""}`,
            kind: "zatca",
            level,
            label,
            count,
            href: "/zatca/documents",
          }))
      : [];
    // تتبع الصلاحية: المنتهي + اللي قرب ينتهي (العدد جزء من المفتاح)
    const ex = data.expiry;
    const expiry = ex
      ? [
          ex.expired > 0 && {
            key: `expiry-expired-${ex.expired}`,
            kind: "expiry",
            level: "overdue",
            label: t("ExpiredBatches"),
            count: ex.expired,
            href: "/inventory/batches?status=expired",
          },
          ex.near > 0 && {
            key: `expiry-near-${ex.near}`,
            kind: "expiry",
            level: "soon",
            label: t("NearExpiryBatches"),
            count: ex.near,
            href: "/inventory/batches?status=near",
          },
        ].filter(Boolean)
      : [];
    return [...zatca, ...expiry, ...data.items];
  }, [data, t, tZ, locale]);

  const unseen = items.filter((i) => !seen.has(i.key)).length;
  const danger = items.some((i) => i.level === "overdue");

  // فتح القايمة = كل اللي فيها اتشاف (الجديد بيفضل متلوّن لحد ما تقفلها)
  const onOpenChange = (o) => {
    setOpen(o);
    if (o) load();
    else {
      const keys = items.map((i) => i.key);
      writeStore(SEEN_KEY, keys);
      setSeen(new Set(keys));
    }
  };

  // تذكير مرة في اليوم: مواعيد النهارده + المتأخر
  useEffect(() => {
    if (!data) return;
    const due = data.items.filter(
      (i) =>
        ["job", "visit", "followUp", "oilChange"].includes(i.kind) &&
        i.level !== "soon",
    );
    if (!due.length) return;
    const { day } = riyadhNow();
    if (readStore(DAILY_KEY, null) === day) return;
    writeStore(DAILY_KEY, day);
    const late = due.filter((i) => i.level === "overdue").length;
    modal.confirm({
      title: t("DailyTitle"),
      content: t("DailyText", { today: due.length - late, late }),
      okText: t("ShowJobs"),
      cancelText: t("Later"),
      // مواعيد تركيب/زيارات ← شاشة المواعيد، متابعات بس ← شاشة المتابعات
      onOk: () =>
        router.push(
          due.some((i) => i.kind === "job" || i.kind === "visit")
            ? "/technicians/jobs"
            : due.some((i) => i.kind === "followUp")
              ? "/follow-ups"
              : "/vehicles?filter=due",
        ),
    });
  }, [data, t, router]);

  // تنبيه الزكاة آخر اليوم (مرة واحدة) لو المعلّق >= الحد
  useEffect(() => {
    const z = data?.zatca;
    if (!z) return;
    const openDocs = z.pending + z.errors + z.unsigned;
    const { day, time } = riyadhNow();
    if (time < z.alertTime || openDocs < z.alertThreshold) return;
    let shown = null;
    try {
      shown = localStorage.getItem(ZATCA_EOD_KEY);
    } catch {
      // التخزين مش متاح
    }
    if (shown === day) return;
    try {
      localStorage.setItem(ZATCA_EOD_KEY, day);
    } catch {
      // التخزين مش متاح
    }
    modal.warning({
      title: tZ("EodTitle"),
      content: tZ("EodText", { count: openDocs }),
      okText: tZ("Ok"),
    });
  }, [data, tZ]);

  // نص الميعاد: متأخر X يوم / النهارده 14:30 / بكرة / بعد X أيام
  const whenText = (i) => {
    if (i.kind === "claimLate")
      return t("AtAgentFor", { days: i.days, agent: nm(i.supplier) || "—" });
    if (i.kind === "contractEnd" || i.kind === "rentEnd")
      return i.days === 0
        ? t("EndsToday")
        : t("EndsIn", { days: i.days, date: formatDay(i.at) });
    const timed =
      i.kind === "job" || i.kind === "booking" || i.kind === "restaurantOrder";
    const time = timed ? timeOf.format(new Date(i.at)) : null;
    const day = timed ? dayOfTime.format(new Date(i.at)) : (i.at ?? "");
    if (i.days < 0) return t("LateBy", { days: -i.days, date: formatDay(day) });
    if (i.days === 0) return time ? t("TodayAt", { time }) : t("Today");
    if (i.days === 1) return time ? t("TomorrowAt", { time }) : t("Tomorrow");
    return t("InDays", { days: i.days, date: formatDay(day) });
  };

  const refText = (i) =>
    i.ref?.kind === "restaurantOrder"
      ? `#${i.ref.number}`
      : i.ref?.kind === "rentContract"
      ? formatDocNo("rentContract", i.ref.number, i.ref.docCode)
      : i.ref?.kind === "booking"
      ? formatDocNo("booking", i.ref.number, i.ref.docCode)
      : i.ref?.kind === "sale"
        ? saleDocNo("sale", i.ref.number, i.ref.docCode)
        : i.ref?.kind === "claim"
          ? formatDocNo("claim", i.ref.number, i.ref.docCode)
          : i.ref
            ? formatDocNo("contract", i.ref.number, i.ref.docCode)
            : "";

  const shown = items.filter(TABS[tab]);
  const tabCount = (k) => items.filter(TABS[k]).length;
  const tabs = Object.keys(TABS).filter((k) => k === "all" || tabCount(k) > 0);

  const go = (href) => {
    onOpenChange(false);
    router.push(href);
  };

  const panel = (
    <div className="notif-panel">
      <div className="notif-head">
        <b>{t("Title")}</b>
        {unseen > 0 && (
          <span className="notif-new">{t("NewCount", { n: unseen })}</span>
        )}
      </div>
      {tabs.length > 2 && (
        <Segmented
          size="small"
          block
          className="notif-tabs"
          value={tabs.includes(tab) ? tab : "all"}
          onChange={setTab}
          options={tabs.map((k) => ({
            value: k,
            label: `${t(`Tab_${k}`)} ${tabCount(k)}`,
          }))}
        />
      )}
      <div className="notif-list">
        {shown.length ? (
          shown.map((i) => {
            const { color, Icon } = KINDS[i.kind];
            return (
              <button
                type="button"
                key={i.key}
                className={`notif-item ${seen.has(i.key) ? "" : "is-new"}`}
                onClick={() => go(i.href)}
              >
                <span className="notif-icon" style={{ "--c": color }}>
                  <Icon />
                </span>
                <span className="notif-body">
                  {i.kind === "zatca" || i.kind === "expiry" ? (
                    <span className="notif-title">
                      {i.label}
                      {i.count != null && <b> ({i.count})</b>}
                    </span>
                  ) : (
                    <>
                      <span className="notif-title">
                        {t(`Kind_${i.kind}`)}: <b>{nm(i.title)}</b>{" "}
                        <bdi className="notif-ref">{refText(i)}</bdi>
                      </span>
                      <span className="notif-sub">
                        {nm(i.customer) || "—"}
                        {i.phone && (
                          <>
                            {" · "}
                            <bdi>{i.phone}</bdi>
                          </>
                        )}
                      </span>
                      {(i.address || i.technician) && (
                        <span className="notif-sub">
                          {[
                            i.address,
                            i.technician && `${staff.one}: ${nm(i.technician)}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                      <span
                        className="notif-when"
                        style={{ color: LEVEL_COLORS[i.level] }}
                      >
                        {whenText(i)}
                      </span>
                    </>
                  )}
                </span>
                {!seen.has(i.key) && <span className="notif-dot" />}
              </button>
            );
          })
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t("Empty")}
          />
        )}
      </div>
      <div className="notif-foot">
        {(can("technicians.jobs") || can("maintenanceContracts.visits")) && (
          <a onClick={() => go("/technicians/jobs")}>{t("AllJobs")}</a>
        )}
        {can("followUps.view") && items.some((i) => i.kind === "followUp") && (
          <a onClick={() => go("/follow-ups")}>{t("AllFollowUps")}</a>
        )}
        {can("bookings.view") && items.some((i) => i.kind === "booking") && (
          <a onClick={() => go("/bookings")}>{t("AllBookings")}</a>
        )}
        {can("vehicles.view") && items.some((i) => i.kind === "oilChange") && (
          <a onClick={() => go("/vehicles?filter=due")}>{t("AllVehicles")}</a>
        )}
        {data?.zatca && (
          <a onClick={() => go("/zatca/documents")}>{tZ("OpenMonitoring")}</a>
        )}
      </div>
    </div>
  );

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={onOpenChange}
      content={panel}
      arrow={false}
      // الموبايل: القائمة ثابتة تحت الهيدر بعرض الشاشة (notifications.css)
      rootClassName="notif-popover"
    >
      <Badge
        count={unseen}
        size="small"
        color={danger ? C.danger : C.warning}
        offset={[-4, 4]}
      >
        <Button
          type="text"
          icon={<BellOutlined style={{ fontSize: 18 }} />}
          aria-label={t("Title")}
        />
      </Badge>
    </Popover>
  );
}
