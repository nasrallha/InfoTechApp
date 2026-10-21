import "server-only";
import fs from "fs";
import readline from "readline";
import mariadb from "mariadb";
import { dbConfig } from "./db-config";

// ============================================================
// استرجاع نسخة احتياطية (ملف .sql معمول من البرنامج نفسه - lib/db-backup)
// - قراءة أولى: نتأكد إن الملف من البرنامج، ونجيب أسماء الجداول والـ migrations اللي فيه
// - قراءة تانية: تنفيذ الأوامر واحد واحد (الملف بيمسح كل جدول ويعمله من جديد)
// الأوامر في الملف كل واحد بيخلص بسطر آخره ";" (النصوص جواها مفيهاش سطور جديدة)
// ============================================================

export const BACKUP_HEADER = "-- ERP database backup";

const lines = (file) =>
  readline.createInterface({
    input: fs.createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

// معلومات الملف: هل هو من البرنامج + الجداول + الـ migrations
export async function inspectBackup(file) {
  let n = 0;
  let valid = false;
  let currentTable = null;
  const tables = new Set();
  const migrations = new Set();
  for await (const line of lines(file)) {
    n++;
    if (n <= 5 && line.startsWith(BACKUP_HEADER)) valid = true;
    if (n === 6 && !valid) break;
    const m = line.match(/^CREATE TABLE `([^`]+)`/);
    if (m) {
      currentTable = m[1];
      tables.add(m[1]);
      continue;
    }
    if (currentTable === "_prisma_migrations" && line.startsWith("(")) {
      for (const mm of line.matchAll(/'(\d{14}_[A-Za-z0-9_]+)'/g)) {
        migrations.add(mm[1]);
      }
    } else if (line.startsWith("INSERT INTO `_prisma_migrations`")) {
      currentTable = "_prisma_migrations";
    }
  }
  return { valid, tables: [...tables], migrations: [...migrations] };
}

const ident = (name) => `\`${String(name).replace(/`/g, "``")}\``;

// تنفيذ الملف على قاعدة البيانات
// الجداول الموجودة دلوقتي ومش في النسخة (اتعملت بعدها) بتتمسح، عشان
// الـ migrations تعيد عملها نضيف بعد الاسترجاع
export async function executeBackup(file, { tables }) {
  const cfg = dbConfig();
  let conn;
  let statements = 0;
  try {
    conn = await mariadb.createConnection({
      ...cfg,
      charset: "utf8mb4",
      connectTimeout: 10000,
    });
    await conn.query("SET SESSION FOREIGN_KEY_CHECKS = 0");

    const existing = await conn.query({
      sql: "SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'",
      rowsAsArray: true,
    });
    const keep = new Set(tables);
    for (const [t] of existing) {
      if (!keep.has(t)) await conn.query(`DROP TABLE IF EXISTS ${ident(t)}`);
    }

    let buf = "";
    for await (const line of lines(file)) {
      if (!buf && (line.startsWith("--") || !line.trim())) continue;
      buf = buf ? `${buf}\n${line}` : line;
      if (line.trimEnd().endsWith(";")) {
        await conn.query(buf);
        statements++;
        buf = "";
      }
    }
    if (buf.trim()) {
      await conn.query(buf);
      statements++;
    }
    await conn.query("SET SESSION FOREIGN_KEY_CHECKS = 1");
    return { statements };
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}
