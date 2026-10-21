import fs from "fs";
import fsp from "fs/promises";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { BACKUP_HEADER } from "@/lib/db-restore";
import { uploadedBackupPath } from "@/services/backup.service";

// رفع ملف نسخة احتياطية من جهازك (عشان تسترجعه بعد كده من الجدول)
// POST /api/backups/upload  - جسم الطلب = الملف نفسه، واسمه في X-File-Name
// بصلاحية backups.restore بس (مالك البرنامج)

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "backups.restore")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!request.body)
    return Response.json({ error: "ValidationError" }, { status: 400 });

  let target;
  try {
    const original = decodeURIComponent(
      request.headers.get("x-file-name") || "backup.sql",
    );
    if (!/\.sql$/i.test(original)) {
      return Response.json({ error: "BackupFormatUnknown" }, { status: 400 });
    }
    target = await uploadedBackupPath(original);
    await pipeline(
      Readable.fromWeb(request.body),
      fs.createWriteStream(target),
    );

    // لازم يكون ملف معمول من البرنامج (أول سطور فيها العنوان)
    const fh = await fsp.open(target, "r");
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(1024), 0, 1024, 0);
    await fh.close();
    if (
      !buffer.subarray(0, bytesRead).toString("utf8").includes(BACKUP_HEADER)
    ) {
      await fsp.unlink(target).catch(() => {});
      return Response.json({ error: "BackupFormatUnknown" }, { status: 400 });
    }
    return Response.json({ success: true, name: target.split(/[\\/]/).pop() });
  } catch (e) {
    if (target) await fsp.unlink(target).catch(() => {});
    console.error("[backup] upload failed:", e?.message ?? e);
    return Response.json(
      { error: e?.code === "BackupDirNotWritable" ? e.code : "UploadFailed" },
      { status: 500 },
    );
  }
}
