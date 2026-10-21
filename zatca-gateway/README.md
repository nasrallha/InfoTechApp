# ZATCA Gateway

خدمة صغيرة بـ .NET 8 بتشغّل **الـ SDK الرسمي لهيئة الزكاة** (الإصدار 3.4.6) وبتكلم بوابة فاتورة.
المشروع (Next.js) بيكلمها على `localhost` بس، عن طريق `lib/zatca-gateway.js`.

```
Next.js + MySQL  ──HTTP (X-Gateway-Key)──►  ZATCA Gateway (.NET 8 + SDK)  ──►  بوابة فاتورة
```

- **الخدمة مش بتخزن أي حاجة.** الشهادات والمفاتيح متخزنة متشفرة في قاعدة بيانات المشروع، وبتتبعت مع كل طلب.
- **بتشتغل على Windows وLinux.** الـ SDK جواه IKVM لكل الأنظمة.

## التشغيل (تلقائي)

**مش محتاج تشغّل أي أمر.** أول ما البرنامج يقوم (`npm run dev` أو `npm start`) بيحصل الآتي:

1. البرنامج يتأكد إن الخدمة شغالة.
2. لو الخدمة مش مبنية، أو الكود اتغير، بيبنيها بـ `dotnet publish` في فولدر `zatca-gateway/publish`. أول مرة ممكن تاخد دقيقة.
3. يشغّلها في الخلفية كعملية تابعة له، ويعيد تشغيلها لو وقعت، ويقفلها لما يقفل.

**المفتاح المشترك** بين البرنامج والخدمة بيتعمل تلقائياً في `.zatca/gateway.key`.

**مفتاح تشفير الشهادات** بيتعمل تلقائياً في `.zatca/master.key`، إلا لو حطيت `ZATCA_MASTER_KEY` في `.env`.

> ⚠ خد نسخة احتياطية من فولدر `.zatca` مع كل نسخة احتياطية لقاعدة البيانات.

**المطلوب على الجهاز:** ‎.NET 8 SDK. ولو فولدر `zatca-gateway/publish` جاهز ومنقول مع البرنامج، يكفي ASP.NET Core Runtime 8. تعمل الفولدر ده بـ `npm run zatca:publish`.

**إعدادات اختيارية في `.env`:**

```
ZATCA_GATEWAY_URL=http://127.0.0.1:5089   # العنوان
ZATCA_GATEWAY_AUTOSTART=false             # لو الخدمة شغالة بطريقة تانية (Windows Service / Docker)
ZATCA_GATEWAY_KEY=...                     # مفتاح ثابت بدل الملف التلقائي
```

**الاختبار الذاتي يدوي** (اختياري): `npm run zatca:selftest`.

## الـ Endpoints

كلها `POST` وبصيغة JSON، وكلها محتاجة الهيدر `X-Gateway-Key`، ما عدا `/health`.

| المسار | الوظيفة |
|---|---|
| `GET /health` | حالة الخدمة، ونسخة الـ SDK، وهل قواعد التحقق موجودة |
| `/selftest` | اختبار ذاتي بشهادة الـ SDK التجريبية |
| `/csr` | توليد CSR والمفتاح الخاص بالـ SDK |
| `/onboarding/compliance-csid` | شهادة الامتثال (CSR + OTP) |
| `/onboarding/compliance-check` | بناء وتوقيع وإرسال فاتورة فحص امتثال |
| `/onboarding/production-csid` | شهادة الإنتاج |
| `/onboarding/renew` | تجديد شهادة الإنتاج (CSR جديد + OTP) |
| `/certificates/info` | بيانات الشهادة وتاريخ انتهائها |
| `/invoices/build` | بناء XML من غير توقيع (للمراجعة) |
| `/invoices/sign` | بناء وتوقيع، وبيرجّع الـ XML والهاش والـ QR والـ UUID |
| `/invoices/validate` | تحقق محلي بالـ SDK (XSD، والقواعد، والتوقيع، والـ QR، والـ PIH) |
| `/invoices/submit` | إرسال للهيئة: `reporting` للمبسطة، و`clearance` للضريبية |

**البيئات (`environment`):**

- `developer`: بوابة المطورين. أي OTP بينفع فيها، مثلاً `123345`.
- `simulation`: بيئة المحاكاة.
- `production`: الإنتاج.

## التثبيت كخدمة منفصلة (اختياري)

لو عايز الخدمة تشتغل لوحدها بعيد عن البرنامج، حط `ZATCA_GATEWAY_AUTOSTART=false` في `.env`، وحط نفس `ZATCA_GATEWAY_KEY` في الخدمة.

**Windows Service:** افتح PowerShell كـ Administrator وشغّل:

```
.\zatca-gateway\deploy\install-windows-service.ps1 -ApiKey "نفس-ZATCA_GATEWAY_KEY"
```

**Linux (systemd):** الخطوات مكتوبة في `deploy/zatca-gateway.service`.

**Docker:** شغّل من فولدر المشروع الرئيسي:

```
docker build -f zatca-gateway/Dockerfile -t zatca-gateway .
docker run -d --name zatca-gateway --restart unless-stopped -p 127.0.0.1:5089:5089 -e ZATCA_GATEWAY_KEY=... zatca-gateway
```

> الاستضافة المشتركة (cPanel العادي) مش بتشغّل خدمات .NET. محتاج VPS أو استضافة بتدعم Docker.

## ملاحظات

- **مكان الـ SDK:** افتراضياً الفولدر `zatca-einvoicing-sdk-DotNet-238-R3.4.6` اللي جنب المشروع. لو حطيته في مكان تاني: `dotnet build -p:ZatcaSdkDir=المسار`.
- **قواعد التحقق:** فولدر `Rules/Schematrons` بيتنسخ جنب البرنامج تلقائي عند البناء.
- **الخصم:** بيتكتب على مستوى السطر، وضريبة كل فئة = الوعاء × النسبة. ولو الإجمالي المتوقع اختلف بقروش، الفرق بيتكتب في `PayableRoundingAmount`.
