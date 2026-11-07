"use client";

import "./status-colors.css";

// أزرار فلتر الحالة: كل زر بلونه وجنبه العدد
// options: [{ value, label, color, count }]
export default function StatusFilters({ options, value, onChange, className }) {
  return (
    <div className={`sc-filters ${className ?? ""}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`sc-filter ${value === o.value ? "is-active" : ""}`}
          style={{ "--c": o.color }}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count != null && (
            <span className="sc-filter__count">{o.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
