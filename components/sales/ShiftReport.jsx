"use client";

import { Table, Tag } from "antd";
import { useLocale, useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/dates";
import { useCurrency } from "@/components/common/CurrencyProvider";
import "@/components/purchases/purchases.css";

const diffTag = (v, t, money) => {
  const d = Number(v);
  return (
    <Tag color={d === 0 ? "green" : d > 0 ? "blue" : "red"}>
      {d > 0 ? "+" : ""}
      {money(d)}{" "}
      {d === 0 ? t("Balanced") : d > 0 ? t("Surplus") : t("Shortage")}
    </Tag>
  );
};

// ============================================================
// ملخص الوردية:
// - المبيعات والمرتجعات وطرق الدفع
// - حركة الدرج: أول المدة + النقدي + سندات القبض - سندات الصرف + إضافة - سحب
// - بعد القفل: الموجود والفرق، الشبكة، المورّد للخزنة والمتروك في الدرج
// ============================================================
export default function ShiftReport({ summary, shift }) {
  const locale = useLocale();
  const t = useTranslations("Shifts");
  const { amount: money, symbolNode: symbol } = useCurrency();
  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName);
  const closed = shift?.status === "closed";
  const userOf = (u) =>
    u ? (locale === "ar" ? u.arFullname : u.enFullname) : "";

  return (
    <div>
      <div className="pur-totals mb-3">
        <div>
          <span>{t("SalesCount")}</span>
          <b>{summary.salesCount}</b>
        </div>
        <div>
          <span>{t("SalesTotal")}</span>
          <bdi>{money(summary.salesTotal)}</bdi>
        </div>
        <div className="pur-totals__discount">
          <span>
            {t("ReturnsTotal")} ({summary.returnsCount})
          </span>
          <bdi>-{money(summary.returnsTotal)}</bdi>
        </div>
        <div className="pur-totals__grand">
          <span>{t("NetSales")}</span>
          <bdi>
            {money(summary.netTotal)} {symbol}
          </bdi>
        </div>
        <div>
          <span>{t("TaxTotal")}</span>
          <bdi>{money(summary.taxTotal)}</bdi>
        </div>
        {summary.creditTotal !== 0 && (
          <div>
            <span>{t("CreditTotal")}</span>
            <bdi>{money(summary.creditTotal)}</bdi>
          </div>
        )}
      </div>

      <Table
        size="small"
        bordered
        rowKey="id"
        pagination={false}
        dataSource={summary.methods}
        locale={{ emptyText: t("NoPayments") }}
        columns={[
          {
            title: t("PaymentMethod"),
            key: "m",
            render: (_, m) => (
              <span>
                {nameOf(m)}{" "}
                {m.type === "cash" && <Tag color="green">{t("Drawer")}</Tag>}
              </span>
            ),
          },
          {
            title: t("Received"),
            key: "r",
            align: "end",
            render: (_, m) => money(m.received),
          },
          {
            title: t("Refunded"),
            key: "f",
            align: "end",
            render: (_, m) => money(m.refunded),
          },
          {
            title: t("Net"),
            key: "n",
            align: "end",
            render: (_, m) => <b>{money(m.net)}</b>,
          },
        ]}
      />

      <h4 className="font-bold mt-4 mb-2">{t("DrawerMovement")}</h4>
      <div className="pur-totals">
        <div>
          <span>{t("OpeningCash")}</span>
          <bdi>{money(summary.openingCash)}</bdi>
        </div>
        {shift?.expectedOpening != null &&
          Number(shift.openingDifference) !== 0 && (
            <div>
              <span>{t("OpeningDifference")}</span>
              {diffTag(shift.openingDifference, t, money)}
            </div>
          )}
        <div>
          <span>{t("CashNet")}</span>
          <bdi>{money(summary.cashNet)}</bdi>
        </div>
        {summary.receiptsCash > 0 && (
          <div>
            <span>
              {t("CashReceipts")} ({summary.receiptsCount})
            </span>
            <bdi>+{money(summary.receiptsCash)}</bdi>
          </div>
        )}
        {summary.paymentsCash > 0 && (
          <div className="pur-totals__discount">
            <span>
              {t("CashPayments")} ({summary.paymentsCount})
            </span>
            <bdi>-{money(summary.paymentsCash)}</bdi>
          </div>
        )}
        {summary.cashAdded > 0 && (
          <div>
            <span>{t("CashAdded")}</span>
            <bdi>+{money(summary.cashAdded)}</bdi>
          </div>
        )}
        {summary.cashWithdrawn > 0 && (
          <div className="pur-totals__discount">
            <span>{t("CashWithdrawn")}</span>
            <bdi>-{money(summary.cashWithdrawn)}</bdi>
          </div>
        )}
        <div className="pur-totals__grand">
          <span>{t("ExpectedCash")}</span>
          <bdi>
            {money(closed ? shift.expectedCash : summary.expectedCash)} {symbol}
          </bdi>
        </div>
        {closed && (
          <>
            <div>
              <span>{t("CountedCash")}</span>
              <bdi>{money(shift.countedCash)}</bdi>
            </div>
            <div>
              <span>{t("Difference")}</span>
              {diffTag(shift.difference, t, money)}
            </div>
          </>
        )}
      </div>

      {closed && (shift.cardCounted != null || shift.cardExpected != null) && (
        <>
          <h4 className="font-bold mt-4 mb-2">{t("CardTerminal")}</h4>
          <div className="pur-totals">
            <div>
              <span>{t("CardSales")}</span>
              <bdi>{money(shift.cardExpected)}</bdi>
            </div>
            <div>
              <span>{t("CardTerminalTotal")}</span>
              <bdi>
                {shift.cardCounted == null ? "—" : money(shift.cardCounted)}
              </bdi>
            </div>
            {shift.cardDifference != null && (
              <div>
                <span>{t("Difference")}</span>
                {diffTag(shift.cardDifference, t, money)}
              </div>
            )}
          </div>
        </>
      )}

      {closed && shift.leftCash != null && (
        <>
          <h4 className="font-bold mt-4 mb-2">{t("Handover")}</h4>
          <div className="pur-totals">
            <div>
              <span>{t("DepositedCash")}</span>
              <bdi>{money(shift.depositedCash)}</bdi>
            </div>
            <div className="pur-totals__grand">
              <span>{t("LeftInDrawer")}</span>
              <bdi>
                {money(shift.leftCash)} {symbol}
              </bdi>
            </div>
          </div>
        </>
      )}

      {closed && shift.denominations && (
        <>
          <h4 className="font-bold mt-4 mb-2">{t("DenominationsCount")}</h4>
          <div className="flex flex-wrap gap-2">
            {[500, 200, 100, 50, 20, 10, 5, 1]
              .filter((d) => Number(shift.denominations[d]) > 0)
              .map((d) => (
                <Tag key={d} color="geekblue">
                  {d} × {shift.denominations[d]}
                </Tag>
              ))}
            {Number(shift.denominations.coins) > 0 && (
              <Tag color="geekblue">
                {t("Coins")}: {money(shift.denominations.coins)}
              </Tag>
            )}
          </div>
        </>
      )}

      {summary.movements?.length > 0 && (
        <>
          <h4 className="font-bold mt-4 mb-2">{t("DrawerCash")}</h4>
          <Table
            size="small"
            bordered
            rowKey="id"
            pagination={false}
            dataSource={summary.movements}
            columns={[
              {
                title: t("Type"),
                key: "type",
                width: 90,
                render: (_, m) =>
                  m.type === "out" ? (
                    <Tag color="red">{t("Withdraw")}</Tag>
                  ) : (
                    <Tag color="green">{t("AddCash")}</Tag>
                  ),
              },
              {
                title: t("Amount"),
                key: "amount",
                width: 110,
                align: "end",
                render: (_, m) => <b>{money(m.amount)}</b>,
              },
              { title: t("Reason"), dataIndex: "reason" },
              {
                title: t("Time"),
                key: "time",
                width: 150,
                render: (_, m) => (
                  <span>
                    <bdi>{formatDateTime(m.createdAt)}</bdi> —{" "}
                    {userOf(m.createdBy)}
                  </span>
                ),
              },
            ]}
          />
        </>
      )}
    </div>
  );
}
