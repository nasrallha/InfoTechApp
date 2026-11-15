"use client";

import { CheckCircleFilled } from "@ant-design/icons";
import { useLocale } from "next-intl";
import { styleImageUrl } from "@/lib/tailoring";
import { C } from "@/lib/theme";

// ============================================================
// تفاصيل التفصيلة: كل مجموعة (الموديل، الرقبة ...) صور تختار منها
// - مجموعة عادية: اختيار واحد (الضغط تاني بيلغيه)
// - مجموعة متعددة (الإضافات): أكتر من اختيار
// groups: [{ id, arName, enName, multiple, choices: [{ id, arName, enName, image }] }]
// value: { "<groupId>": [choiceId, ...] }
// ============================================================
export default function StylePicker({ groups, value = {}, onChange }) {
  const locale = useLocale();
  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName || x.arName);

  const toggle = (g, id) => {
    const cur = value[String(g.id)] ?? [];
    const has = cur.includes(id);
    const next = g.multiple
      ? has
        ? cur.filter((x) => x !== id)
        : [...cur, id]
      : has
        ? []
        : [id];
    onChange?.({ ...value, [String(g.id)]: next });
  };

  return (
    <div className="tailor-styles">
      {groups.map((g) => (
        <div key={g.id} className="tailor-styles__group">
          <div className="tailor-styles__title">{nameOf(g)}</div>
          <div className="tailor-styles__choices">
            {g.choices.map((c) => {
              const on = (value[String(g.id)] ?? []).includes(c.id);
              return (
                <button
                  type="button"
                  key={c.id}
                  className={`tailor-choice${on ? " tailor-choice--on" : ""}`}
                  onClick={() => toggle(g, c.id)}
                  aria-pressed={on}
                >
                  {c.image ? (
                    <img
                      src={styleImageUrl(c.image)}
                      alt=""
                      className="tailor-choice__img"
                    />
                  ) : (
                    <span className="tailor-choice__img tailor-choice__img--empty" />
                  )}
                  <span className="tailor-choice__name">{nameOf(c)}</span>
                  {on && (
                    <CheckCircleFilled
                      className="tailor-choice__check"
                      style={{ color: C.success }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
