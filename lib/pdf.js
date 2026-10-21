import { downloadBlob, safeName } from "./excel";

// ============================================================
// تحويل مستند معروض (فاتورة / سند / تقرير) إلى ملف PDF وتنزيله
// element: عنصر المستند في الصفحة (بنفس مقاسه الحقيقي بالمللي)
// paper: "A4" ← صفحات A4 (يُقسَّم المستند الطويل على أكثر من صفحة)
//        "80mm" / "58mm" ← صفحة واحدة بعرض الورق وطول المستند
// ============================================================

const PAPER_MM = { A4: 210, "80mm": 80, "58mm": 58 };
const A4_HEIGHT = 297;

// attachXml: { xml, name } ← يتضمّن الـ XML جوه الـ PDF (فاتورة إلكترونية بصيغة PDF/A-3)
export async function downloadPdf(
  element,
  fileName,
  paper = "A4",
  { attachXml } = {},
) {
  // PDF/A-3: الصور JPEG (من غير شفافية) عشان الملف يعدّي فحص PDF/A
  let blob = await renderPdfBlob(element, paper, {
    opaque: !!attachXml?.xml,
  });
  if (attachXml?.xml) blob = await toPdfA3(blob, attachXml, fileName);
  downloadBlob(blob, `${safeName(fileName)}.pdf`);
}

// رسم المستند كـ PDF (Blob)
// opaque: الصور JPEG بدل PNG (من غير قناة شفافية) - مطلوب لـ PDF/A
export async function renderPdfBlob(element, paper = "A4", { opaque } = {}) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);
  // الـ QR بيترسم بعد ما المستند يظهر: نستنى لحد ما مكانه الفاضي يتملي (بحد أقصى 3 ثواني)
  for (let i = 0; i < 30; i++) {
    if (!element.querySelector(".inv__qr-empty, .a4__qr--empty")) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  // الصور (الشعار، QR) لازم تكون محمّلة قبل التصوير
  await Promise.all(
    [...element.querySelectorAll("img")].map((img) =>
      img.complete
        ? null
        : new Promise((r) => {
            img.onload = r;
            img.onerror = r;
          }),
    ),
  );
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
  });
  const img = (c) => (opaque ? c.toDataURL("image/jpeg", 0.95) : c);
  const fmt = opaque ? "JPEG" : "PNG";
  const widthMm = PAPER_MM[paper] ?? 210;
  const pxPerMm = canvas.width / widthMm;
  const fullHeightMm = canvas.height / pxPerMm;

  let pdf;
  if (paper !== "A4") {
    pdf = new jsPDF({
      unit: "mm",
      format: [widthMm, Math.max(fullHeightMm, 40)],
      orientation: "portrait",
    });
    pdf.addImage(img(canvas), fmt, 0, 0, widthMm, fullHeightMm);
  } else {
    pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageHeightPx = Math.floor(A4_HEIGHT * pxPerMm);
    let offset = 0;
    let first = true;
    while (offset < canvas.height - 2) {
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = Math.min(pageHeightPx, canvas.height - offset);
      slice
        .getContext("2d")
        .drawImage(
          canvas,
          0,
          offset,
          canvas.width,
          slice.height,
          0,
          0,
          canvas.width,
          slice.height,
        );
      if (!first) pdf.addPage();
      pdf.addImage(img(slice), fmt, 0, 0, widthMm, slice.height / pxPerMm);
      first = false;
      offset += pageHeightPx;
    }
  }
  return pdf.output("blob");
}

// ------------------------------------------------------------
// الفاتورة الإلكترونية بصيغة PDF/A-3B (زي ما الهيئة بتطلب)
// - الـ XML الرسمي متخزن جوه الملف: EmbeddedFile (application/xml)
//   + Filespec بعلاقة AFRelationship = Data + مصفوفة AF في الـ Catalog
// - OutputIntent بملف ألوان sRGB (لأن الصفحات صور RGB)
// - بيانات XMP (pdfaid part 3 / B) متطابقة مع بيانات الملف (Info)
// - معرّف الملف (trailer ID) + إصدار PDF 1.7
// ------------------------------------------------------------
const pdfDate = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}Z`;
};
const xmlEsc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function toPdfA3(blob, { xml, name }, title) {
  const [lib, { SRGB_ICC_BASE64 }] = await Promise.all([
    import("pdf-lib"),
    import("./srgb-icc"),
  ]);
  const { PDFDocument, PDFName, PDFString, PDFHexString, PDFArray, PDFHeader } =
    lib;

  const pdf = await PDFDocument.load(await blob.arrayBuffer(), {
    updateMetadata: false,
  });
  const ctx = pdf.context;
  const catalog = pdf.catalog;
  const now = new Date();
  now.setMilliseconds(0);
  const fileName = name || "invoice.xml";
  const docTitle = title || fileName.replace(/\.xml$/i, "");

  ctx.header = PDFHeader.forVersion(1, 7);

  // 1) الـ XML كملف مرفق
  const data = new TextEncoder().encode(xml);
  const efRef = ctx.register(
    ctx.flateStream(data, {
      Type: "EmbeddedFile",
      Subtype: "application/xml",
      Params: {
        Size: data.length,
        CreationDate: PDFString.fromDate(now),
        ModDate: PDFString.fromDate(now),
      },
    }),
  );
  const specRef = ctx.register(
    ctx.obj({
      Type: "Filespec",
      F: PDFString.of(fileName),
      UF: PDFHexString.fromText(fileName),
      EF: { F: efRef, UF: efRef },
      Desc: PDFString.of("ZATCA e-invoice (UBL 2.1 XML)"),
      AFRelationship: "Data",
    }),
  );
  const names =
    catalog.lookupMaybe(PDFName.of("Names"), lib.PDFDict) ?? ctx.obj({});
  names.set(
    PDFName.of("EmbeddedFiles"),
    ctx.obj({ Names: [PDFString.of(fileName), specRef] }),
  );
  catalog.set(PDFName.of("Names"), names);
  const af = PDFArray.withContext(ctx);
  af.push(specRef);
  catalog.set(PDFName.of("AF"), af);

  // 2) ملف الألوان (OutputIntent)
  const icc = Uint8Array.from(atob(SRGB_ICC_BASE64), (c) => c.charCodeAt(0));
  const iccRef = ctx.register(ctx.flateStream(icc, { N: 3 }));
  catalog.set(
    PDFName.of("OutputIntents"),
    ctx.obj([
      {
        Type: "OutputIntent",
        S: "GTS_PDFA1",
        OutputConditionIdentifier: PDFString.of("sRGB IEC61966-2.1"),
        Info: PDFString.of("sRGB IEC61966-2.1"),
        RegistryName: PDFString.of("http://www.color.org"),
        DestOutputProfile: iccRef,
      },
    ]),
  );

  // 3) بيانات الملف (Info) - لازم تطابق الـ XMP
  pdf.setTitle(docTitle);
  pdf.setProducer("ERP");
  pdf.setCreator("ERP");
  pdf.setCreationDate(now);
  pdf.setModificationDate(now);

  // 4) XMP (بدون ضغط)
  const iso = pdfDate(now);
  const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about=""
 xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"
 xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:xmp="http://ns.adobe.com/xap/1.0/"
 xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
<pdfaid:part>3</pdfaid:part>
<pdfaid:conformance>B</pdfaid:conformance>
<dc:format>application/pdf</dc:format>
<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEsc(docTitle)}</rdf:li></rdf:Alt></dc:title>
<xmp:CreateDate>${iso}</xmp:CreateDate>
<xmp:ModifyDate>${iso}</xmp:ModifyDate>
<xmp:MetadataDate>${iso}</xmp:MetadataDate>
<xmp:CreatorTool>ERP</xmp:CreatorTool>
<pdf:Producer>ERP</pdf:Producer>
</rdf:Description>
</rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
  const bytes = new TextEncoder().encode(xmp);
  catalog.set(
    PDFName.of("Metadata"),
    ctx.register(ctx.stream(bytes, { Type: "Metadata", Subtype: "XML" })),
  );

  // 5) معرّف الملف
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(id), PDFHexString.of(id)]);

  const out = await pdf.save({ useObjectStreams: false });
  return new Blob([out], { type: "application/pdf" });
}
