// ============================================================
// تعريف / تغيير حساب مالك البرنامج (بيتكتب في ملف .env جنب المشروع)
//   npm run owner:set
// بيسأل عن: اسم الدخول، الباسورد (مخفي)، الاسم بالعربي والإنجليزي (اختياري)
// الباسورد بيتحفظ متشفّر (scrypt) مش النص نفسه
// بعد التغيير: اقفل البرنامج وشغّله تاني (عشان يقرا الملف من جديد)
// لإلغاء حساب المالك: امسح سطور OWNER_ من ملف .env
// ============================================================
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { randomBytes, scryptSync } from "node:crypto";

const ENV_FILE = path.join(process.cwd(), ".env");

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    if (hidden) {
      // منطبعش الحروف وهو بيكتب الباسورد
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(s);
        else if (s === "\r\n" || s === "\n") rl.output.write(s);
        else rl.output.write("*");
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

const quote = (v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

async function main() {
  console.log("\n=== Program owner account ===\n");
  const username = await ask("Enter username: ");
  if (!/^[A-Za-z0-9._-]{3,50}$/.test(username) || username === "__owner__") {
    console.error("✖ Username must be 3-50 characters: English letters, numbers, . _ -");
    process.exit(1);
  }
  const password = await ask("Enter password: ", { hidden: true });
  if (password.length < 8) {
    console.error("✖ Password must be at least 8 characters");
    process.exit(1);
  }
  const again = await ask("Confirm password: ", { hidden: true });
  if (again !== password) {
    console.error("✖ Passwords do not match");
    process.exit(1);
  }
  const arName = (await ask("Enter Arabic name (optional, press Enter to skip): ")) ||
    "مالك البرنامج";
  const enName = (await ask("Enter English name (optional, press Enter to skip): ")) ||
    "Program Owner";

  // نفس طريقة lib/password.js (scrypt + salt عشوائي)، بـ : بدل $
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");

  const values = {
    OWNER_USERNAME: username,
    OWNER_PASSWORD: `scrypt:${salt}:${hash}`,
    OWNER_NAME_AR: arName,
    OWNER_NAME_EN: enName,
  };

  // باقي سطور الملف زي ما هي، وسطور OWNER_ القديمة بتتبدل
  const old = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8") : "";
  const kept = old
    .split(/\r?\n/)
    .filter(
      (line) =>
        !/^\s*OWNER_(USERNAME|PASSWORD|NAME_AR|NAME_EN)\s*=/.test(line) &&
        !/^#\s*(Program owner account|حساب مالك البرنامج)/.test(line),
    );
  while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
  const block = [
    "",
    "# Program owner account (npm run owner:set)",
    ...Object.entries(values).map(([k, v]) => `${k}=${quote(v)}`),
    "",
  ];
  fs.writeFileSync(ENV_FILE, [...kept, ...block].join("\n"), "utf8");

  console.log(`\n✔ Owner account "${username}" saved to ${ENV_FILE}`);
  console.log("  Restart the program (stop it and run it again) to apply.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
