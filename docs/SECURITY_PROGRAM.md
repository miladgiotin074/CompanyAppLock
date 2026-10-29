# برنامهٔ امنیت ناوگان — CompanyAppLock

تاریخ شروع سند: ۲۰۲۶-۱۰-۲۶.  
مخاطب: تیم امنیت شرکت + توسعه‌دهندگان + AI agent.

این سند **مکمل** `CLAUDE.md` و **زیرمجموعهٔ** `docs/BEHAVIOR_CONTRACT.md` است: AppLock عملیاتی که روی نمونه‌های آزمایشگاهی تست شده **نباید** در پیِ کار امنیتی خراب شود. هر تعارض با قرارداد رفتار → ابتدا تأیید صریح کارفرما، وگرنه طراحی را عوض کنید نه AppLock را.

---

## ۱) هدف و دامنه

**هدف:** محافظت گوشی‌های اندرویدی **متعلق به شرکت** که کارمندان با آن کار می‌کنند، در برابر **بدافزارهای نوین** (نه فقط لیست سیاه قدیمی).

**دامنهٔ فعلی محصول:** AppLock + پنل + sync + FCM (مستند در `BEHAVIOR_CONTRACT.md`).

**دامنهٔ در حال تعریف:** لایهٔ تشخیص/پاسخ به تهدید که از همان زیرساخت (لیست اپ، دسترسی‌ها، heartbeat، پنل) استفاده کند where possible.

**خارج از دامنه:** دستگاه شخصی کارمند، حمله به اشخاص ثالث، انتشار ابزار تهاجمی عمومی، دور زدن Play Protect برای distribution گسترده.

---

## ۲) نقشهٔ فاز (Roadmap)

| فاز | خروجی | وابستگی |
|---|---|---|
| **R — Research** | یادداشت TTP بدافزار جدید (overlay، usage، persistence، social install) | منابع threat intel داخلی/عمومی؛ بدون کد تهاجمی |
| **D — Design** | سند «سیستم امنیتی هدف» (سیگنال، تصمیم، اقدام، نقش پنل) | تأیید کارفرما قبل از کد زیاد |
| **L — Lab PoC** | APK جدا، signed جدا، فقط دستگاه lab؛ overlay + usage access | `docs/lab/` گزارش هر run |
| **E — Evaluate** | جدول قوت/ضعف AppLock و infra در براب PoC | بدون تغییر قرارداد رفتار |
| **I — Integrate** | ماژول/فلگ/API ضدبدافزار با پیش‌فرض off | `BEHAVIOR_CONTRACT` به‌روز فقط با تأیید |

**قانون ترتیب:** تا پایان **E**، هیچ رفتار production AppLock (قفل سیاست، یک نوتیفیکیشن، gating نت+صفحه، …) عوض نمی‌شود مگر bugfix یا درخواست صریح.

---

## ۳) بدافزار نوین — چه چیز را مطالعه و شبیه‌سازی می‌کنیم

تمرکز روی الگوهای **نسخه‌های جدید** (۲۰۲۴–۲۰۲۶ و بعد)، نه فقط بانک‌تروجان کلاسیک:

| TTP | چرا مهم است | ارتباط با AppLock |
|---|---|---|
| **Usage Access** | رصد اپ foreground، timing حمله، دور زدن UI | همان API که AppLock برای قفل استفاده می‌کند — خطر ابزار مشروع و مخرب یکسان به نظر می‌رسند |
| **Overlay / SYSTEM_ALERT_WINDOW** | فیشینگ، clickjacking، پوشش روی اپ بانکی | AppLock خود overlay دارد — تمایز benign vs malicious حیاتی است |
| **Sideload / unknown installer** | bypass store | لیست اپ + `PackageReceiver` از قبل telemetry می‌دهد |
| **Persistence** (FGS، boot، alarm، work) | ماندگاری بدافزار | AppLock همان لایه persistence را دارد — نباید در دفاع، خودمان را kill کنیم |
| **Hide icon / alias** | مخفی‌سازی | AppLock `IconController` — whitelist لازم |
| **Accessibility abuse** (فاز بعدی research) | کنترل UI بدون overlay | ممکن است در PoC v2 بیاید؛ v1 اختیاری |

**PoC v1 (تأیید فاز L فعلی):** حداقل **Usage Access + Overlay** روی سناریوی lab (مثلاً «وقتی اپ X جلو است، overlay آموزشی/تست نمایش بده»). بدون exfil، بدون C2 production.

---

## ۴) معماری جداسازی (الزام)

```
companyapplock/
  android/app/              ← APK عملیاتی AppLock (دست نزن مگر قرارداد)
  android/lab-malware-sample/   ← PoC جدا (پیشنهاد مسیر؛ ایجاد با تأیید)
  docs/lab/                 ← گزارش آزمایش
  docs/SECURITY_PROGRAM.md  ← این فایل
```

- **package name متفاوت** (مثلاً `com.company.lab.malwarepoc` — نهایی با کارفرما).
- **امضای debug/lab جدا**؛ هرگز همان keystore تولید AppLock.
- **بدون اشتراک** FCM topic `all-devices` با PoC؛ اگر telemetry lab لازم شد topic/پروژه Firebase lab.
- PoC **نباید** به API production `register` بی‌مجوز وصل شود مگر endpoint lab و flag.

---

## ۵) قواعد آزمایشگاه

1. **مجوز:** فقط دستگاه‌های inventory شدهٔ lab؛ لیست serial/deviceId در `docs/lab/DEVICES.md` (ایجاد when needed).
2. **شبکه:** ترجیح VLAN lab؛ بدون دسترسی به دادهٔ واقعی کارمند.
3. **نصب PoC:** فقط توسط تیم امنیت؛ uninstall پس از session یا نگه‌داری کنترل‌شده.
4. **AppLock روی همان دستگاه:** مجاز برای تست تعامل (آیا PoC می‌تواند overlay AppLock را بپوشاند؟ آیا usage دو طرفه دیده می‌شود؟).
5. **ثبت نتیجه:** قالب پیشنهادی هر run در `docs/lab/RUN_TEMPLATE.md` (می‌توان بعداً ساخت) — تاریخ، build id، OEM، Android version، سناریو، pass/fail، یادداشت.

---

## ۶) ارزیابی در برابر AppLock (Evaluate)

سوالات ثابت برای هر iteration PoC (پاسخ در گزارش lab):

1. آیا PoC بدون تعامل کاربر می‌تواند overlay روی اپ **قفل‌شدهٔ سیاست** بگذارد؟
2. آیا PoC می‌تواند usage را طوری مصرف کند که AppLock foreground را اشتباه ببیند؟
3. آیا persistence PoC با watchdog AppLock **race** می‌کند (kill، باتری، OEM)؟
4. آیا پنل **لیست اپ / دسترسی‌ها** PoC را به‌موقع نشان می‌دهد؟
5. آیا ترکیب «overlay + usage» در پنل **قابل تمایز** از AppLock است (برای rule آینده)؟
6. False positive: آیا خود AppLock یا ابزار IT شرکت trigger می‌شود؟

**خروجی E:** جدول «دفاع پیشنهادی» (مثلاً alert در پنل، block sideload package، هشدار ترکیب خطرناک دسترسی) — **بدون پیاده‌سازی** تا تأیید D→I.

---

## ۷) یکپارچه‌سازی آینده (Integrate) — اصول

- **Feature flag** سمت کلاینت و/یا setting سراسری در `Settings` — پیش‌فرض **غیرفعال**.
- **هیچ نوتیفیکیشن اضافه** از side امنیت تا خلاف `BEHAVIOR_CONTRACT` تأیید نشود.
- **مسیر device-side** فعلی idempotent بماند؛ payload جدید (مثلاً `threatHints`) optional و backward-compatible.
- **Whitelist:** `com.company.applock` و packageهای IT تأییدشده هرگز auto-block نشوند.
- تغییر `LockController.shouldEnforce` یا شرط `NET_CAPABILITY_INTERNET` برای «امنیت» **ممنوع** بدون تأیید صریح (همان باگ‌های گذشته را زنده می‌کند).

---

## ۸) حریم خصوصی و داده (هم‌راستا با AppLock)

ضدبدافزار production فقط:

- پکیج، برچسب، system/user flag، زمان نصب/آپدیت (در صورت نیاز)، snapshot دسترسی‌ها (usage/overlay/…)، نتیجهٔ rule (score/label).

**نه:** محتوای notification سایر اپ‌ها، screenshot، keystroke، SMS، location.

---

## ۹) کار با AI agent

- قبل از هر task امنیتی: بخوان `BEHAVIOR_CONTRACT.md` + این فایل.
- Task نوع «PoC malware»: فقط مسیر lab جدا + سند lab؛ diff روی `android/app` را minimize کن.
- Task نوع «defense»: طراحی/ماژول جدا یا API additive؛ تست رفتار regression ذهنی در برابر قرارداد.
- Build APK: کارفرما (Android Studio) — همان قانون AppLock.

---

## ۱۰) وضعیت فعلی (snapshot)

| مورد | وضعیت |
|---|---|
| AppLock + پنل + lab smoke | انجام شده (طبق کارفرما) |
| `BEHAVIOR_CONTRACT.md` | ثبت رفتار ثابت |
| PoC malware (overlay + usage) | **شروع نشده** — منتظر فاز L |
| سند design دفاع (D) | **شروع نشده** — بعد از R |
| پوشه `android/lab-malware-sample/` | **ایجاد نشده** — با شروع L |

---

## ۱۱) مراجع داخلی

- `CLAUDE.md` §۶ — خلاصهٔ قوانین برای agent  
- `docs/BEHAVIOR_CONTRACT.md` — رفتار مقدم  
- `docs/STABILITY_REVIEW.md` — persistence و recovery AppLock (برای مقایسه با PoC)
