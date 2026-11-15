"use client";

// ============================================================
// رسمة الثوب التفاعلية (SVG من قدّام): الرقبة / الجبزور / جيب الصدر /
// الكبك / المخابي / جيب الجوال والقلم بتتغير حسب الاختيارات
// thobe: من thobeFromChoices (lib/thobe.js)
// الأجزاء اللي اتحددت صراحةً بلون البرنامج، والباقي بلون الخط العادي
// ============================================================
const W = 240;
const mx = (x) => W - x; // نفس الجزء على الجنب التاني

const pts = (arr) => arr.map(([x, y]) => `${x},${y}`).join(" ");
const mirror = (arr) => arr.map(([x, y]) => [mx(x), y]);

export default function ThobeFigure({ thobe, width = 200, className }) {
  const ink = "var(--c-text)";
  const accent = "var(--c-primary)";
  const fill = "var(--c-surface)";
  const soft = "var(--c-primary-soft)";
  const color = (kind) => (thobe.chosen?.[kind] ? accent : ink);
  const sw = (kind) => (thobe.chosen?.[kind] ? 2 : 1.3);
  const line = (kind) => ({
    stroke: color(kind),
    strokeWidth: sw(kind),
    fill: "none",
  });
  const shape = (kind) => ({
    stroke: color(kind),
    strokeWidth: sw(kind),
    fill,
  });

  // ---------- الكبك (طرف الكم) ----------
  const cuffLeft = {
    plain: [
      [31, 226],
      [59, 234],
      [56, 248],
      [28, 240],
    ],
    button: [
      [31, 226],
      [59, 234],
      [56, 248],
      [28, 240],
    ],
    angled: [
      [31, 226],
      [59, 234],
      [56, 248],
      [35, 244],
      [28, 234],
    ],
  };
  const cuff = (side) => {
    const flip = side === "r" ? mirror : (a) => a;
    if (thobe.cuff === "round") {
      const d =
        side === "l"
          ? "M31,226 L59,234 L56,246 Q44,252 29,240 Z"
          : `M${mx(31)},226 L${mx(59)},234 L${mx(56)},246 Q${mx(44)},252 ${mx(29)},240 Z`;
      return <path d={d} {...shape("cuff")} />;
    }
    return (
      <>
        <polygon
          points={pts(flip(cuffLeft[thobe.cuff] ?? cuffLeft.plain))}
          {...shape("cuff")}
        />
        {thobe.cuff === "button" && (
          <circle
            cx={side === "l" ? 45 : mx(45)}
            cy={238}
            r={2.2}
            fill={color("cuff")}
          />
        )}
      </>
    );
  };

  // ---------- الرقبة ----------
  const band = "M102,36 Q120,28 138,36 L138,44 Q120,54 102,44 Z";
  const collar = () => {
    const c = thobe.collar;
    if (c === "none") return null;
    if (c === "round")
      return (
        <path
          d="M102,36 Q120,28 138,36 L138,44 Q128,56 120,50 Q112,56 102,44 Z"
          {...shape("collar")}
        />
      );
    return (
      <>
        <path d={band} {...shape("collar")} />
        {c !== "shirt" && <path d="M120,49 L120,54" {...line("collar")} />}
        {c === "band1" && (
          <circle cx={120} cy={46} r={2} fill={color("collar")} />
        )}
        {c === "band2" && (
          <>
            <circle cx={116} cy={45} r={1.8} fill={color("collar")} />
            <circle cx={124} cy={45} r={1.8} fill={color("collar")} />
          </>
        )}
        {c === "shirt" && (
          <>
            <path d="M103,43 L110,64 L120,52 Z" {...shape("collar")} />
            <path d="M137,43 L130,64 L120,52 Z" {...shape("collar")} />
          </>
        )}
      </>
    );
  };

  // ---------- الجبزور (فتحة الصدر) ----------
  const placket = () => {
    const p = thobe.placket;
    const dots = [70, 88, 106, 124, 142];
    if (p === "zipper")
      return (
        <>
          <path d="M120,52 L120,160" {...line("placket")} />
          {Array.from({ length: 18 }, (_, i) => 56 + i * 6).map((y) => (
            <path
              key={y}
              d={`M117.5,${y} L122.5,${y}`}
              stroke={color("placket")}
              strokeWidth={0.9}
            />
          ))}
        </>
      );
    const box = p === "hidden" || p === "hiddenButtons";
    return (
      <>
        {box ? (
          <rect
            x={115}
            y={52}
            width={10}
            height={108}
            rx={1.5}
            {...line("placket")}
          />
        ) : (
          <path d="M120,52 L120,160" {...line("placket")} />
        )}
        {(p === "buttons" || p === "hiddenButtons") &&
          dots.map((y) => (
            <circle key={y} cx={120} cy={y} r={2} fill={color("placket")} />
          ))}
      </>
    );
  };

  // ---------- جيب الصدر (على شمال اللابس = يمين الرسمة) ----------
  const pocket = () => {
    const p = thobe.pocket;
    if (p === "none") return null;
    const d = {
      square: "M134,94 L156,94 L156,118 L134,118 Z",
      round: "M134,94 L156,94 L156,110 Q145,124 134,110 Z",
      pointed: "M134,94 L156,94 L156,113 L145,121 L134,113 Z",
      flap: "M134,94 L156,94 L156,118 L134,118 Z",
    }[p];
    return (
      <>
        <path d={d} {...shape("pocket")} />
        {p === "square" && <path d="M134,99 L156,99" {...line("pocket")} />}
        {p === "flap" && (
          <path
            d="M134,94 L156,94 L156,101 L145,106 L134,101 Z"
            fill={soft}
            {...line("pocket")}
          />
        )}
      </>
    );
  };

  // ---------- المخابي (جيوب الجنب) ----------
  const sidePockets = () =>
    thobe.side.map((s) => {
      const dash = s === "hidden" ? "3 3" : undefined;
      return (
        <g key={s}>
          <path d="M92,198 L96,234" {...line("side")} strokeDasharray={dash} />
          <path
            d={`M${mx(92)},198 L${mx(96)},234`}
            {...line("side")}
            strokeDasharray={dash}
          />
          {s === "snap" && (
            <>
              <circle cx={93} cy={195} r={2.2} fill={color("side")} />
              <circle cx={mx(93)} cy={195} r={2.2} fill={color("side")} />
            </>
          )}
        </g>
      );
    });

  // ---------- إضافات: جيب الجوال (جوه الجنب) وجيب القلم (جنب جيب الصدر) ----------
  const extras = () =>
    thobe.extra.map((e) =>
      e === "phone" ? (
        <rect
          key={e}
          x={132}
          y={238}
          width={16}
          height={24}
          rx={2}
          {...line("extra")}
          strokeDasharray="3 2"
        />
      ) : (
        <rect
          key={e}
          x={127}
          y={94}
          width={4}
          height={16}
          rx={1}
          {...line("extra")}
        />
      ),
    );

  return (
    <svg
      viewBox={`0 0 ${W} 420`}
      width={width}
      className={className}
      role="img"
      style={{ display: "block", margin: "0 auto" }}
    >
      {/* الكمين ورا الجسم */}
      <polygon
        points={pts([
          [70, 54],
          [28, 240],
          [56, 248],
          [86, 128],
        ])}
        stroke={ink}
        strokeWidth={1.3}
        fill={fill}
      />
      <polygon
        points={pts(
          mirror([
            [70, 54],
            [28, 240],
            [56, 248],
            [86, 128],
          ]),
        )}
        stroke={ink}
        strokeWidth={1.3}
        fill={fill}
      />
      {/* الجسم لحد الكعب */}
      <path
        d="M104,40 L70,54 L84,124 L78,410 L162,410 L156,124 L170,54 L136,40 Q120,52 104,40 Z"
        stroke={ink}
        strokeWidth={1.3}
        fill={fill}
      />
      {cuff("l")}
      {cuff("r")}
      {sidePockets()}
      {placket()}
      {pocket()}
      {extras()}
      {collar()}
    </svg>
  );
}
