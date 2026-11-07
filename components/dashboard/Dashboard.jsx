"use client";

import { useState } from "react";
import { Button, Card, Empty, Segmented, Tag } from "antd";
import {
  ToolOutlined,
  AppstoreOutlined,
  SafetyCertificateOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  BarChartOutlined,
  CalendarOutlined,
  CreditCardOutlined,
  DesktopOutlined,
  DollarOutlined,
  FieldTimeOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  InboxOutlined,
  LineChartOutlined,
  PlusOutlined,
  RollbackOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  SwapOutlined,
  TagsOutlined,
  TeamOutlined,
  UserOutlined,
  WalletOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { formatDateTime } from "@/lib/dates";
import { useBizToday } from "@/components/common/useBusinessDay";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { useCan, useCurrentUser } from "@/components/auth/AuthProvider";
import { AreaLines, Donut, HBars } from "@/components/reports/Charts";
import { C } from "@/lib/theme";
import "./dashboard.css";

// ============================================================
// الاختصارات السريعة: كل زر يظهر فقط لمن يملك صلاحيته
// ============================================================
const QUICK_ACTIONS = [
  {
    key: "pos",
    href: "/pos",
    Icon: DesktopOutlined,
    color: C.primary,
    perm: "sales.pos",
  },
  {
    key: "newSale",
    href: "/invoices/sales/new",
    Icon: ShoppingCartOutlined,
    color: C.infoText,
    perm: "sales.create",
  },
  {
    key: "newSaleReturn",
    href: "/invoices/sales-returns/new",
    Icon: RollbackOutlined,
    color: C.dangerText,
    perm: "salesReturns.create",
  },
  {
    key: "newQuotation",
    href: "/invoices/quotations/new",
    Icon: FileSearchOutlined,
    color: C.purple,
    perm: "quotations.create",
  },
  {
    key: "newPurchase",
    href: "/invoices/purchases/new",
    Icon: ShoppingOutlined,
    color: C.primary,
    perm: "purchases.create",
  },
  {
    key: "newReceipt",
    href: "/accounts/receipts/new",
    Icon: ArrowDownOutlined,
    color: C.successText,
    perm: "receipts.create",
  },
  {
    key: "newPayment",
    href: "/accounts/payments/new",
    Icon: ArrowUpOutlined,
    color: C.dangerText,
    perm: "paymentVouchers.create",
  },
  {
    key: "dailyReport",
    href: "/reports/daily",
    Icon: CalendarOutlined,
    color: C.warningText,
    perm: "reports.daily",
  },
  {
    key: "stock",
    href: "/inventory/stock",
    Icon: InboxOutlined,
    color: C.muted,
    perm: "stock.view",
  },
  {
    key: "newProduct",
    href: "/products/addproduct",
    Icon: TagsOutlined,
    color: C.info,
    perm: "products.create",
  },
];

const METHOD_ICON = {
  cash: <DollarOutlined />,
  card: <CreditCardOutlined />,
  transfer: <SwapOutlined />,
  wallet: <WalletOutlined />,
};
const METHOD_COLOR = {
  cash: C.successText,
  card: C.infoText,
  transfer: C.purple,
  wallet: C.warningText,
};

// سهم المقارنة (أخضر صاعد / أحمر نازل)
function Trend({ value, label }) {
  if (value == null)
    return <span className="dash-trend dash-trend--flat">{label}</span>;
  const up = value >= 0;
  return (
    <span
      className={`dash-trend ${up ? "dash-trend--up" : "dash-trend--down"}`}
    >
      {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
      <bdi>{Math.abs(value)}%</bdi>{" "}
      <span className="dash-trend__label">{label}</span>
    </span>
  );
}

// كارت رقم كبير
function Kpi({ icon, title, value, sub, color, href }) {
  const body = (
    <div className="dash-kpi" style={{ "--c": color }}>
      <div className="dash-kpi__icon">{icon}</div>
      <div className="dash-kpi__body">
        <div className="dash-kpi__title">{title}</div>
        <div className="dash-kpi__value">
          <bdi>{value}</bdi>
        </div>
        {sub && <div className="dash-kpi__sub">{sub}</div>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="dash-link">
      {body}
    </Link>
  ) : (
    body
  );
}

// الفواتير الإلكترونية (الزكاة): المعلّق والمرفوض وحالة الخدمة
function ZatcaDashCard({ z }) {
  const tZ = useTranslations("Zatca");
  const rows = [
    [
      "pending",
      z.pending + z.errors,
      z.pending + z.errors > 0 ? "gold" : "green",
    ],
    ["rejected", z.rejected, z.rejected ? "red" : "green"],
    ["overdue", z.overdue, z.overdue ? "red" : "green"],
    ["unsigned", z.unsigned, z.unsigned ? "red" : "green"],
  ];
  return (
    <Card
      size="small"
      className="dash-card"
      title={
        <span>
          <SafetyCertificateOutlined /> {tZ("EInvoice")}
        </span>
      }
      extra={<Link href="/zatca/documents">{tZ("OpenMonitoring")}</Link>}
    >
      <ul className="dash-list">
        <li className="dash-list__row">
          <span>{tZ("Service")}</span>
          <Tag color={z.gatewayOnline ? "green" : "red"}>
            {z.gatewayOnline ? tZ("Online") : tZ("Offline")}
          </Tag>
        </li>
        {rows.map(([k, v, c]) => (
          <li key={k} className="dash-list__row">
            <span>{tZ(`bell.${k}`)}</span>
            <Tag color={c}>{v}</Tag>
          </li>
        ))}
        {z.expiring.map((e, i) => (
          <li key={i} className="dash-list__row" style={{ color: C.dangerText }}>
            {tZ("bell.cert", { branch: e.branch.arName, days: e.days })}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function Dashboard({ data }) {
  const locale = useLocale();
  const t = useTranslations("Dashboard");
  const user = useCurrentUser();
  const can = useCan();
  const { amount: money, symbol } = useCurrency();
  const [period, setPeriod] = useState("days");
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const un = (x) => (x ? (locale === "ar" ? x.arFullname : x.enFullname) : "");
  const actions = QUICK_ACTIONS.filter((a) => can(a.perm));

  // التحية حسب الوقت
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Asia/Riyadh",
    }).format(new Date()),
  );
  // النهارده = يوم العمل الحالي (روابط "الشهر" و"النهارده" للتقارير)
  const now = useBizToday();
  const monthStart = `${now.slice(0, 7)}-01`;
  const greeting =
    hour < 12 ? t("Morning") : hour < 18 ? t("Afternoon") : t("Evening");
  const todayText = new Intl.DateTimeFormat(
    locale === "ar" ? "ar-EG" : "en-GB",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Riyadh",
    },
  ).format(new Date());

  const cnt = data.counts;
  const counts = [
    {
      key: "categories",
      Icon: AppstoreOutlined,
      href: "/categories",
      perm: "categories.view",
    },
    {
      key: "products",
      Icon: TagsOutlined,
      href: "/products",
      perm: "products.view",
    },
    {
      key: "customers",
      Icon: TeamOutlined,
      href: "/customers",
      perm: "customers.view",
    },
    {
      key: "suppliers",
      Icon: ShopOutlined,
      href: "/suppliers",
      perm: "suppliers.view",
    },
    { key: "users", Icon: UserOutlined, href: "/users", perm: "users.view" },
  ].filter((c) => can(c.perm));

  return (
    <div className="dash">
      {/* ================= 1) شريط الترحيب + ورديتي + الاختصارات ================= */}
      <section className="dash-hero">
        <div className="dash-hero__top">
          <div>
            <h1 className="dash-hero__hello" suppressHydrationWarning>
              {greeting}، {un(user)}
            </h1>
            <div className="dash-hero__meta" suppressHydrationWarning>
              <CalendarOutlined /> {todayText} · <ShopOutlined />{" "}
              {nm(user?.branch)}
            </div>
          </div>
          {data.shift && (
            <div className="dash-shift">
              <FieldTimeOutlined className="dash-shift__icon" />
              {data.shift.open ? (
                <div>
                  <div className="dash-shift__title">
                    {t("ShiftOpen")} <bdi>{data.shift.docNo}</bdi>
                  </div>
                  <div className="dash-shift__meta">
                    {t("Since")}{" "}
                    <bdi>{formatDateTime(data.shift.openedAt)}</bdi> ·{" "}
                    {t("InvoicesCount", { count: data.shift.invoices })}
                  </div>
                  {data.shift.expectedCash != null && (
                    <div className="dash-shift__cash">
                      {t("InDrawer")}:{" "}
                      <b>
                        <bdi>
                          {money(data.shift.expectedCash)} {symbol}
                        </bdi>
                      </b>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="dash-shift__title">{t("NoShift")}</div>
                  <Link href="/pos">
                    <Button size="small" className="mt-1">
                      {t("OpenShift")}
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
        {actions.length > 0 && (
          <div className="dash-actions">
            {actions.map(({ key, href, Icon, color }) => (
              <Link
                key={key}
                href={href}
                className="dash-action"
                style={{ "--c": color }}
              >
                <span className="dash-action__icon">
                  <Icon />
                </span>
                <span className="dash-action__label">
                  {t(`actions.${key}`)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ================= 2) أرقام النهارده والشهر ================= */}
      {data.finance && (
        <section className="dash-grid dash-grid--4">
          <Kpi
            icon={<ShoppingCartOutlined />}
            color={C.infoText}
            title={t("TodaySales")}
            value={`${money(data.today.sales)} ${symbol}`}
            sub={<Trend value={data.today.change} label={t("VsYesterday")} />}
            href={can("reports.sales") ? "/reports/sales" : undefined}
          />
          <Kpi
            icon={<FileTextOutlined />}
            color={C.purple}
            title={t("TodayInvoices")}
            value={data.today.count}
            sub={`${t("AvgInvoice")}: ${money(data.today.avg)}`}
          />
          <Kpi
            icon={<BarChartOutlined />}
            color={C.accent}
            title={t("MonthSales")}
            value={`${money(data.month.sales)} ${symbol}`}
            sub={<Trend value={data.month.change} label={t("VsLastMonth")} />}
            href={
              can("reports.sales")
                ? `/reports/sales?from=${monthStart}&to=${now}`
                : undefined
            }
          />
          <Kpi
            icon={<LineChartOutlined />}
            color={data.month.profit >= 0 ? C.successText : C.dangerText}
            title={t("MonthProfit")}
            value={`${money(data.month.profit)} ${symbol}`}
            sub={`${t("Margin")}: ${data.month.margin}%`}
            href={
              can("reports.profit")
                ? `/reports/profit?from=${monthStart}&to=${now}`
                : undefined
            }
          />
        </section>
      )}

      {/* ================= 3) فلوس النهارده حسب طريقة الدفع ================= */}
      {data.finance && data.money && (
        <Card
          size="small"
          className="dash-card"
          title={
            <span>
              <WalletOutlined /> {t("TodayMoney")}
            </span>
          }
          extra={
            can("reports.daily") && (
              <Link href="/reports/daily">{t("DailyReport")}</Link>
            )
          }
        >
          <div className="dash-money">
            {data.money.methods.map((m) => (
              <div
                key={m.id}
                className="dash-money__item"
                style={{ "--c": METHOD_COLOR[m.type] ?? C.muted }}
              >
                <span className="dash-money__icon">
                  {METHOD_ICON[m.type] ?? <DollarOutlined />}
                </span>
                <span className="dash-money__name">{nm(m)}</span>
                <b className="dash-money__value">
                  <bdi>{money(m.net)}</bdi>
                </b>
              </div>
            ))}
            <div className="dash-money__item dash-money__item--total">
              <span className="dash-money__name">{t("TotalNet")}</span>
              <b className="dash-money__value">
                <bdi>
                  {money(data.money.total)} {symbol}
                </bdi>
              </b>
            </div>
          </div>
          <div className="dash-hint">{t("TodayMoneyHint")}</div>
        </Card>
      )}

      {/* ================= 4) الرسوم ================= */}
      {data.finance && (
        <section className="dash-grid dash-grid--main">
          <Card
            size="small"
            className="dash-card"
            title={
              <span>
                <LineChartOutlined /> {t("SalesAndProfit")}
              </span>
            }
            extra={
              <Segmented
                size="small"
                value={period}
                onChange={setPeriod}
                options={[
                  { value: "days", label: t("Last30Days") },
                  { value: "months", label: t("Last12Months") },
                ]}
              />
            }
          >
            <AreaLines
              height={300}
              data={period === "days" ? data.days : data.months}
              series={[
                { key: "sales", name: t("Sales"), color: C.infoText },
                { key: "profit", name: t("Profit"), color: C.success },
              ]}
            />
          </Card>
          <Card
            size="small"
            className="dash-card"
            title={
              <span>
                <CreditCardOutlined /> {t("PaymentMethodsMonth")}
              </span>
            }
          >
            {data.methods.length ? (
              <Donut
                height={300}
                data={data.methods.map((m) => ({
                  name: nm(m),
                  value: m.amount,
                }))}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </section>
      )}

      {/* ================= 5) القوائم السريعة ================= */}
      <section className="dash-grid dash-grid--2">
        {data.recentSales && (
          <Card
            size="small"
            className="dash-card"
            title={
              <span>
                <FileTextOutlined /> {t("RecentSales")}
              </span>
            }
            extra={<Link href="/invoices/sales">{t("ViewAll")}</Link>}
          >
            {data.recentSales.length ? (
              <ul className="dash-list">
                {data.recentSales.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/invoices/${s.type === "return" ? "sales-returns" : "sales"}/${s.id}`}
                      className="dash-list__row"
                    >
                      <span className="dash-list__main">
                        <b>
                          <bdi>{s.docNo}</bdi>
                        </b>{" "}
                        {s.type === "return" ? (
                          <Tag color="red">{t("Return")}</Tag>
                        ) : s.source === "pos" ? (
                          <Tag color="geekblue">{t("Pos")}</Tag>
                        ) : null}
                        <span className="dash-list__sub">
                          {(locale === "ar"
                            ? s.customerArName
                            : s.customerEnName) || t("CashCustomer")}{" "}
                          · <bdi>{formatDateTime(s.date)}</bdi>
                        </span>
                      </span>
                      <b
                        className={
                          s.type === "return" ? "text-red-600" : undefined
                        }
                      >
                        <bdi>
                          {s.type === "return" ? "-" : ""}
                          {money(s.totalAmount)}
                        </bdi>
                      </b>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        )}

        {data.finance && (
          <Card
            size="small"
            className="dash-card"
            title={
              <span>
                <TagsOutlined /> {t("TopProductsMonth")}
              </span>
            }
          >
            {data.topProducts.length ? (
              <HBars
                data={data.topProducts.map((p) => ({
                  name: nm(p),
                  net: p.net,
                }))}
                dataKey="net"
                color={C.purple}
                height={260}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        )}

        {data.zatca?.enabled && <ZatcaDashCard z={data.zatca} />}

        {/* زيارات عقود الصيانة: المتأخرة + خلال 7 أيام */}
        {(data.visits?.overdue > 0 || data.visits?.upcoming > 0) && (
          <Card
            size="small"
            className="dash-card"
            title={
              <span>
                <ToolOutlined /> {t("Visits")}
              </span>
            }
            extra={<Link href="/technicians/jobs">{t("ViewAll")}</Link>}
          >
            <div className="flex flex-wrap gap-2">
              {data.visits.overdue > 0 && (
                <Tag color="red">
                  {t("VisitsOverdue", { n: data.visits.overdue })}
                </Tag>
              )}
              {data.visits.upcoming > 0 && (
                <Tag color="blue">
                  {t("VisitsUpcoming", { n: data.visits.upcoming })}
                </Tag>
              )}
            </div>
          </Card>
        )}

        {/* طلبات الضمان والصيانة: جاهز للتسليم + متأخر عند الوكيل */}
        {data.claims?.open > 0 && (
          <Card
            size="small"
            className="dash-card"
            title={
              <span>
                <ToolOutlined /> {t("Claims")}
              </span>
            }
            extra={<Link href="/warranty-claims">{t("ViewAll")}</Link>}
          >
            <div className="flex flex-wrap gap-2">
              <Tag color="blue">{t("ClaimsOpen", { n: data.claims.open })}</Tag>
              {data.claims.ready > 0 && (
                <Tag color="green">
                  {t("ClaimsReady", { n: data.claims.ready })}
                </Tag>
              )}
              {data.claims.atAgentLate > 0 && (
                <Tag color="red">
                  {t("ClaimsAgentLate", { n: data.claims.atAgentLate })}
                </Tag>
              )}
            </div>
          </Card>
        )}

        {data.openShifts && (
          <Card
            size="small"
            className="dash-card"
            title={
              <span>
                <FieldTimeOutlined /> {t("OpenShifts")}
              </span>
            }
            extra={<Link href="/sales/shifts?status=open">{t("ViewAll")}</Link>}
          >
            {data.openShifts.length ? (
              <ul className="dash-list">
                {data.openShifts.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/sales/shifts/${s.id}`}
                      className="dash-list__row"
                    >
                      <span className="dash-list__main">
                        <b>{un(s.user)}</b>{" "}
                        <Tag color="green">
                          <bdi>{s.docNo}</bdi>
                        </Tag>
                        <span className="dash-list__sub">
                          {nm(s.branch)} · {t("Since")}{" "}
                          <bdi>{formatDateTime(s.openedAt)}</bdi>
                        </span>
                      </span>
                      <span className="dash-list__sub">
                        {t("InvoicesCount", { count: s.invoices })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t("NoOpenShifts")}
              />
            )}
          </Card>
        )}

        {data.lowStock && (
          <Card
            size="small"
            className="dash-card"
            title={
              <span>
                <WarningOutlined style={{ color: C.warningText }} />{" "}
                {t("LowStockList", { threshold: data.lowStock.threshold })}
              </span>
            }
            extra={<Link href="/inventory/stock">{t("ViewAll")}</Link>}
          >
            {data.lowStock.count > 0 && (
              <div className="mb-2">
                <Tag color="orange">
                  {t("LowCount", { count: data.lowStock.count })}
                </Tag>
                {data.lowStock.outOfStock > 0 && (
                  <Tag color="red">
                    {t("OutOfStock", { count: data.lowStock.outOfStock })}
                  </Tag>
                )}
              </div>
            )}
            {data.lowStock.items.length ? (
              <ul className="dash-list">
                {data.lowStock.items.map((p) => (
                  <li key={p.id} className="dash-list__row">
                    <span className="dash-list__main">
                      {nm(p)}
                      <span className="dash-list__sub">
                        <bdi>{p.code}</bdi>
                      </span>
                    </span>
                    <Tag color={p.qty <= 0 ? "red" : "orange"}>
                      {p.qty} {nm(p.baseUnit)}
                    </Tag>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t("NoLowStock")}
              />
            )}
          </Card>
        )}
      </section>

      {/* ================= 6) الأعداد (شريط صغير) ================= */}
      {counts.length > 0 && (
        <section className="dash-counts">
          {counts.map(({ key, Icon, href }) => (
            <Link key={key} href={href} className="dash-count">
              <Icon />
              <span>{t(`counts.${key}`)}</span>
              <b>{cnt[key]}</b>
            </Link>
          ))}
          {can("products.create") && (
            <Link
              href="/products/addproduct"
              className="dash-count dash-count--add"
            >
              <PlusOutlined />
              <span>{t("actions.newProduct")}</span>
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
