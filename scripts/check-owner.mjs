// ============================================================
// التأكد من باسورد مالك البرنامج (من غير ما تغيّره)
//   npm run owner:check
// بيقرا البصمة المتشفّرة من ملف .env، ويسألك عن الباسورد (مخفي)،
// ويقولك صح ولا غلط. مفيش حاجة بتتغيّر في الملف.
// ============================================================
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { scryptSync, timingSafeEqual } from "node:crypto";

const ENV_FILE = path.join(process.cwd(), ".env");

function readEnv(name) {
  if (!fs.existsSync(ENV_FILE)) return "";
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`));
    if (m)
      return m[1]
        .trim()
        .replace(/^"(.*)"$/, "$1")
        .replace(/^'(.*)'$/, "$1");
  }
  return "";
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    rl._writeToOutput = (s) => {
      if (s.includes(question)) rl.output.write(s);
      else if (s === "\r\n" || s === "\n") rl.output.write(s);
      else rl.output.write("*");
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

async function main() {
  const username = readEnv("OWNER_USERNAME");
  const stored = readEnv("OWNER_PASSWORD");
  const [algo, salt, hashHex] = stored.split(":");
  if (!username || algo !== "scrypt" || !salt || !hashHex) {
    console.error("✖ No owner account found in .env (run: npm run owner:set)");
    process.exit(1);
  }
  console.log(`\nOwner username: ${username}\n`);
  const password = await askHidden("Enter password to check: ");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
    console.log("✔ Correct password");
  } else {
    console.log("✖ Wrong password (to set a new one: npm run owner:set)");
    process.exit(2);
  }
}

main();
