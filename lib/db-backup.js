import "server-only";
import fs from "fs";
import fsp from "fs/promises";
import { once } from "events";
import mariadb from "mariadb";
import { currentDbConfig } from "./db-config";

// ============================================================
// نسخة احتياطية كاملة لقاعدة البيانات في ملف .sql
// - مكتوبة بـ JavaScript (من غير mysqldump) فتشتغل على ويندوز ولينكس ودوكر
//   من غير ما نحتاج نعرف مكان برنامج MySQL على الجهاز
// - كل الجداول (بما فيها _prisma_migrations): هيكل الجدول + البيانات
// - لقطة ثابتة (consistent snapshot): لو حد بيبيع وقت النسخ، الملف مايتلخبطش
// - الاسترجاع بأي أداة عادية:
//   mysql -u root -p --default-character-set=utf8mb4 dbname < file.sql
// ============================================================

const BATCH_ROWS = 500; // صفوف كل INSERT
const BATCH_BYTES = 1024 * 1024; // أو 1MB أيهما أقرب

const ESCAPES = {
  "\0": "\\0",
  "\n": "\\n",
  "\r": "\\r",
  "\b": "\\b",
  "\t": "\\t",
  "\x1a": "\\Z",
  "\\": "\\\\",
  "'": "\\'",
  '"': '\\"',
};

const quote = (s) =>
  `'${String(s).replace(/[\0\n\r\b\t\x1a\\'"]/g, (c) => ESCAPES[c])}'`;

const pad = (n, l = 2) => String(n).padStart(l, "0");
const dateSql = (d) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
  `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`;

function sqlValue(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "boolean") return v ? "1" : "0";
  if (Buffer.isBuffer(v)) return v.length ? `0x${v.toString("hex")}` : "''";
  if (v instanceof Date) return quote(dateSql(v));
  if (typeof v === "object") return quote(JSON.stringify(v));
  return quote(v);
}

const ident = (name) => `\`${String(name).replace(/`/g, "``")}\``;

// filePath: الملف النهائي (بنكتب في .part الأول وبعدين نغيّر الاسم)
// بترجع: { tables, rows }
export async function dumpDatabase(filePath) {
  const cfg = await currentDbConfig();
  const tmp = `${filePath}.part`;
  const out = fs.createWriteStream(tmp, { encoding: "utf8" });
  // خطأ في الكتابة (المساحة خلصت مثلاً): نمسكه بدل ما يوقع السيرفر
  let writeError = null;
  out.on("error", (e) => {
    writeError = e;
  });
  const write = async (s) => {
    if (writeError) throw writeError;
    if (!out.write(s)) await once(out, "drain");
  };

  let conn;
  let tables = 0;
  let rows = 0;
  try {
    conn = await mariadb.createConnection({
      ...cfg,
      // التواريخ زي ما هي متخزنة بالظبط (من غير تحويل توقيت)
      dateStrings: true,
      // الأرقام العشرية والكبيرة كنص (من غير فقد دقة)
      decimalAsNumber: false,
      bigIntAsNumber: false,
      charset: "utf8mb4",
      connectTimeout: 10000,
    });

    await conn.query("SET SESSION time_zone = '+00:00'");
    await conn.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await conn.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");

    const [{ v: version }] = await conn.query("SELECT VERSION() AS v");

    await write(
      [
        "-- ============================================================",
        "-- ERP database backup",
        `-- Database: ${cfg.database}`,
        `-- Server:   ${version}`,
        `-- Created:  ${new Date().toISOString()}`,
        `-- Restore:  mysql -u USER -p --default-character-set=utf8mb4 ${cfg.database} < this-file.sql`,
        "-- ============================================================",
        "",
        "SET NAMES utf8mb4;",
        "SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;",
        "SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;",
        "SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO';",
        "SET @OLD_TIME_ZONE=@@TIME_ZONE, TIME_ZONE='+00:00';",
        "",
        "",
      ].join("\n"),
    );

    const list = await conn.query({
      sql: "SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'",
      rowsAsArray: true,
    });

    for (const [table] of list) {
      tables++;
      const [create] = await conn.query({
        sql: `SHOW CREATE TABLE ${ident(table)}`,
        rowsAsArray: true,
      });
      await write(
        `-- ----------------------------\n-- ${table}\n-- ----------------------------\n` +
          `DROP TABLE IF EXISTS ${ident(table)};\n${create[1]};\n\n`,
      );

      // البيانات على دفعات (stream: مش بنحمّل الجدول كله في الذاكرة)
      const head = `INSERT INTO ${ident(table)} VALUES\n`;
      let batch = [];
      let size = 0;
      const flush = async () => {
        if (!batch.length) return;
        await write(`${head}${batch.join(",\n")};\n`);
        batch = [];
        size = 0;
      };

      const stream = conn.queryStream({
        sql: `SELECT * FROM ${ident(table)}`,
        rowsAsArray: true,
      });
      for await (const row of stream) {
        const line = `(${row.map(sqlValue).join(",")})`;
        batch.push(line);
        size += line.length;
        rows++;
        if (batch.length >= BATCH_ROWS || size >= BATCH_BYTES) await flush();
      }
      await flush();
      await write("\n");
    }

    await conn.query("COMMIT");

    await write(
      [
        "SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;",
        "SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;",
        "SET SQL_MODE=@OLD_SQL_MODE;",
        "SET TIME_ZONE=@OLD_TIME_ZONE;",
        `-- Done: ${tables} tables, ${rows} rows`,
        "",
      ].join("\n"),
    );

    out.end();
    await once(out, "finish");
    await fsp.rename(tmp, filePath);
    return { tables, rows };
  } catch (error) {
    out.destroy();
    await fsp.unlink(tmp).catch(() => {});
    throw error;
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}
