"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { C, CHART_COLORS } from "@/lib/theme";

// ألوان الرسوم من lib/theme.js (قيم حقيقية مش متغيرات CSS عشان SVG)
export { CHART_COLORS };

// الأرقام الكبيرة على المحور: 12500 ← 12.5K
const short = (v) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
};

// "2026-09-14" ← "14/09"، "2026-09" ← "09/2026"
export const bucketLabel = (key) =>
  key.length === 7
    ? `${key.slice(5, 7)}/${key.slice(0, 4)}`
    : `${key.slice(8, 10)}/${key.slice(5, 7)}`;

// series: [{ key, name, color }]
export function BarsChart({ data, series, height = 300, stacked }) {
  const { amount } = useCurrency();
  return (
    <div dir="ltr" style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="key" tickFormatter={bucketLabel} fontSize={11} />
          <YAxis tickFormatter={short} fontSize={11} width={50} />
          <Tooltip formatter={(v) => amount(v)} labelFormatter={bucketLabel} />
          <Legend />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color}
              radius={[4, 4, 0, 0]}
              stackId={stacked ? "a" : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AreaLines({ data, series, height = 300 }) {
  const { amount } = useCurrency();
  return (
    <div dir="ltr" style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <AreaChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            {series.map((s) => (
              <linearGradient
                key={s.key}
                id={`g-${s.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor={s.color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="key" tickFormatter={bucketLabel} fontSize={11} />
          <YAxis tickFormatter={short} fontSize={11} width={50} />
          <Tooltip formatter={(v) => amount(v)} labelFormatter={bucketLabel} />
          <Legend />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#g-${s.key})`}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// data: [{ name, value }]
export function Donut({ data, height = 280 }) {
  const { amount } = useCurrency();
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div dir="ltr" style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
            label={({ percent }) =>
              percent > 0.04 ? `${Math.round(percent * 100)}%` : ""
            }
          >
            {data.map((d, i) => (
              <Cell
                key={d.name}
                fill={d.color ?? CHART_COLORS[i % CHART_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(v) =>
              `${amount(v)} (${total ? Math.round((v / total) * 100) : 0}%)`
            }
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// أعمدة أفقية (أكثر الأصناف مبيعاً)
export function HBars({
  data,
  dataKey,
  nameKey = "name",
  color = C.info,
  height = 300,
}) {
  const { amount } = useCurrency();
  return (
    <div dir="ltr" style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickFormatter={short} fontSize={11} />
          <YAxis type="category" dataKey={nameKey} width={130} fontSize={11} />
          <Tooltip formatter={(v) => amount(v)} />
          <Bar dataKey={dataKey} fill={color} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
