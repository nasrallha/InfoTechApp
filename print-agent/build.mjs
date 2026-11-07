// ============================================================
// بناء الوسيط ملف واحد (.exe) فيه Node نفسه (Node Single Executable Application)
// npm run build ← dist/InfoTech-Print-Agent.exe + نسخة في ../public/downloads
// ============================================================
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "dist");
const out = path.join(dist, "InfoTech-Print-Agent.exe");
fs.mkdirSync(dist, { recursive: true });

// 1) كل الكود في ملف واحد
const esbuild = await import("esbuild");
await esbuild.build({
  entryPoints: [path.join(here, "src", "agent.js")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: path.join(dist, "agent.cjs"),
});

// 2) الـ blob بتاع Node SEA
const seaConfig = path.join(dist, "sea-config.json");
fs.writeFileSync(
  seaConfig,
  JSON.stringify({
    main: path.join(dist, "agent.cjs"),
    output: path.join(dist, "sea-prep.blob"),
    disableExperimentalSEAWarning: true,
  }),
);
execFileSync(process.execPath, ["--experimental-sea-config", seaConfig], { stdio: "inherit" });

// 3) نسخة من node.exe + حقن الكود فيها
fs.copyFileSync(process.execPath, out);
execFileSync(
  process.execPath,
  [
    path.join(here, "node_modules", "postject", "dist", "cli.js"),
    out,
    "NODE_SEA_BLOB",
    path.join(dist, "sea-prep.blob"),
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ],
  { stdio: "inherit" },
);

// 4) نسخة للتحميل من البرنامج (شاشة الطباعة)
const pub = path.join(here, "..", "public", "downloads");
fs.mkdirSync(pub, { recursive: true });
fs.copyFileSync(out, path.join(pub, "InfoTech-Print-Agent.exe"));
console.log("✓", out);
