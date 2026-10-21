import fs from "fs";
import fsp from "fs/promises";
import { Readable } from "stream";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { backupFilePath } from "@/services/backup.service";

// تنزيل نسخة احتياطية: /api/backups/backup_xxx.sql
// بصلاحية backups.download بس (الملف فيه كل بيانات البرنامج)

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(request, { params }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "backups.download")) {
    return new Response("Forbidden", { status: 403 });
  }

  const { name } = await params;
  let file;
  try {
    file = await backupFilePath(decodeURIComponent(name));
    const st = await fsp.stat(file);
    if (!st.isFile()) return notFound();

    return new Response(Readable.toWeb(fs.createReadStream(file)), {
      headers: {
        "Content-Type": "application/sql; charset=utf-8",
        "Content-Length": String(st.size),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return notFound();
  }
}
