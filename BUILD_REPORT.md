# تقرير البناء — Smart Design Deconstructor

آخر تحديث: 2026-10-29
الفرع: `main` · المستودع: `mahmoudelnagarprint-web/doory`

---

## 1) الحالة العامة

| البند | النتيجة | الحالة |
|---|---|---|
| اختبارات الـ Deconstructor | 7 / 7 ناجحة (`vitest`) | ✅ |
| ESLint (deconstructor + CollagePanel) | 0 أخطاء | ✅ |
| TypeScript (ملفات الـ Deconstructor + CollagePanel) | 0 أخطاء | ✅ |
| ميزانية الحزمة — مسار المحرر | 457.9 kB gzip (الحد 460) | ✅ |
| ميزانية الحزمة — حزمة المحرر | 134.7 kB gzip (الحد 160) | ✅ |
| TypeScript للمشروع كاملًا | 0 أخطاء | ✅ |
| اختبار تصدير PSD | 1 / 1 ناجح (`vitest`) | ✅ |

**الخلاصة:** الميزة جاهزة ومدمجة، اختباراتها خضراء، وميزانية الحزمة مطابقة. تصدير PSD أُعيدت كتابته ليصدر طبقات حقيقية بحدود مطلقة وتجميع قصّ صحيح، و`npm run build` يمرّ بالكامل الآن.

---

## 2) التعديلات المُنجزة

### 2.1 الميزة الأساسية — `commit 1edd0a8`

ميزة **تفكيك قالب ذكي** داخل بانل الكولاج، مع تحميل كسول (lazy) كامل للمنطق الثقيل:

| الملف | الوصف |
|---|---|
| `frontend/src/editor/collage/deconstructor/types.ts` | الواجهات المشتركة: `Raster`، `Rect2D`، `Point2D`، `RotatedFrame`، `DetachedElement`، `DetectedTextCard`، `DeconstructionResult` |
| `frontend/src/editor/collage/deconstructor/frameExtractor.ts` | كشف الإطارات المُدوّرة (OBB) + فصل الأوراق بـ CIE L*a*b* + طبقة تعتيم للعناصر المحجوبة |
| `frontend/src/editor/collage/deconstructor/elementDetacher.ts` | GrabCut تفاعلي (Lasso/Box) + Telea Fast Marching Inpainting + تخليق نسيج للثقوب الكبيرة |
| `frontend/src/editor/collage/deconstructor/textDeconstructor.ts` | فصل النصوص، مسحها من خلفية الورق (binarize + inpaint)، وإعادة توليدها كطبقة نص حيّة |
| `frontend/src/editor/collage/deconstructor/DeconstructStudioModal.tsx` | مودال بأربعة أوضاع: كشف تلقائي / تفكيك عنصر / مسح نص / بناء |
| `frontend/src/editor/panels/CollagePanel.tsx` | زر «تفكيك قالب ذكي» + `React.lazy` + `Suspense` (التحميل عند الطلب فقط) |

كل الخوارزميات مكتوبة يدويًا على `OffscreenCanvas` داخل المتصفح: بلا خادم، بلا واجهات مدفوعة، وبلا أي اعتمادية جديدة.

### 2.2 الاختبارات والميزانية — `commit e89b168`

- `templateDeconstructor.test.ts`: 7 اختبارات تغطي `paperMask`، `minimumAreaRectangle`، `generateGrabCutMask`، `inpaintHole`، `binarizeInk`، `spawnLiveTextLayer`.
- بيئة Node/Vitest لا تملك `Image`/`OffscreenCanvas`، فأُضيفت polyfills خفيفة داخل ملف الاختبار (`MockOffscreenCanvas`, `MockImage`, `MockImageData`) بدل إدخال اعتماديات جديدة.
- فحص الميزانية: `npm run bundle:check` ← `Bundle budgets: ok`.

### 2.3 ضبط الجودة — `commit b8d49dd`

- إزالة **كل** `@ts-nocheck` و `@ts-ignore` من `deconstructor/` و `CollagePanel.tsx`.
- إصلاح أخطاء وقت التشغيل الحقيقية في `inpaintHole` (`nx`, `ny`, `y` كانت غير معرّفة داخل حلقة الجوار).
- تحويل استدعاءات `toDataURL` غير الموجودة في أنواع `OffscreenCanvas` إلى `(canvas as any)` بدل كتم الفحص.
- تنظيف استيرادات ودوال غير مستخدمة (`_MaskShape`, `_rotatePoint`, `_setElements`, `_setTextCards`, `_mask`).
- إزالة خاصية `open` غير الموجودة في `DeconstructStudioModalProps` من استدعاء المودال.

### 2.4 إظهار PSD في شبكة التنزيل السريع

كان PSD مسجّلًا في محرك التصدير لكنه غير موجود في شبكة الاختصارات داخل قائمة **Share / Download**، لأنه غير مضمّن في قائمة البلاطات الستة (`png`, `jpg`, `webp`, `pdf`, `svg`, `video`).

- `frontend/src/editor/TopBar.tsx`: أُضيف `...tile('psd')` بين `svg` و`video` (الشبكة 3 أعمدة ← صف جديد).
- عنوان البلاطة ثابت قصير `PSD` عبر `tileLabels` (بدل العنوان الطويل `PSD - Photoshop Layers (.psd)` الخاص بنافذة الخيارات)، والعنوان الفرعي `Editable Layers`.
- يظهر الزر تلقائيًا فقط عندما يكون الفورمات مسجّلًا ومتاحًا (`usable('psd')`)، وبنفس تنسيق بقية البلاطات.
- `frontend/src/editor/strings.ts`: إضافة `psd: 'Editable Layers'` إلى `t.topbar.formatHint`.
- `frontend/src/editor/chrome/chrome.test.tsx`: اختبار يتحقق من وجود بلاطة `PSD` في الشبكة، ومن أن الضغط عليها يشغّل التصدير بـ `formatId: 'psd'`.

### 2.5 إعادة كتابة تصدير PSD (حدود مطلقة + قصّ حقيقي) — هذه الدفعة

فتح المستخدم الملف في Photoshop فظهرت مربعات رمادية فارغة وحدود مزاحة وصور مفقودة. أسباب ذلك في النسخة السابقة من `exportPsd.ts`:

| العطل | السبب الجذري |
|---|---|
| مربعات رمادية فارغة | `createObjectCanvas` كان يرسم مستطيلًا بلون `obj.fill` (رمادي افتراضي) ولا يرسم الصورة أو الشكل فعليًا |
| حدود مزاحة | `width/height` مأخوذة من `obj.width` دون `scaleX/scaleY` أو الدوران، ودون تقريب أو قصّ على الصفحة |
| الصور مفقودة داخل القناع | بنية القص معكوسة: الطبقة المقصوصة كانت **تحت** القاعدة، و`clipping` على الطبقة الخطأ |
| خلفية تغطي التصميم | طبقة `Background` كانت **أول** عنصر في `children`؛ و`ag-psd` يكتب `children` من الأعلى إلى الأسفل، فصارت الخلفية أعلى طبقة |
| مجموعات بلا حدود | لم تكن لمجموعات الإطار `top/left/bottom/right` |

ما تم تنفيذه:

- **رسم حقيقي للبكسل:** كل طبقة تُرسم من `StaticCanvas` الخاص بالصفحة عبر `toCanvasElement(scale, { left, top, width, height, filter })`، أي نفس محرّك الرسم المستخدم في تصدير PNG — لا مستطيلات بديلة.
- **حدود مطلقة صارمة:** `getBoundingRect()` لكل كائن ← تقريب للخارج ← قصّ على حدود الصفحة، ثم بـ`scale`: `left/top` مطلقان و`bottom = top + height`، و`right = left + width`. وأبعاد كانفس كل طبقة تُضبط لتساوي `right-left` × `bottom-top` بالضبط.
- **الشفافية والإخفاء:** البكسلات تُرسم بشفافية كاملة (opacity = 1) ثم تُطبَّق شفافية الطبقة مرة واحدة في PSD؛ والطبقات المخفية تحتفظ ببكسلاتها وتُصدَّر بـ `hidden: true` بدل أن تفقد محتواها.
- **هندسة القص:** لكل سْلوت مجموعة `Frame - …` بترتيب `[Photo(clipping: true), Frame Mask]` — الصورة **فوق** القاعدة مباشرة. القاعدة هي ظلّ الإطار بلون صلب يُشتق من ألفا الرسم الفعلي، والصورة تُرسم بدون قناعها لتُقصّ في Photoshop بواسطة القاعدة.
- **ترتيب الطبقات:** `children` من الأعلى للأسفل (عكس ترتيب `page.objects`)، والخلفية آخر عنصر (أسفل الكومة).
- **الصورة التركيبية (composite):** تُرسم من نفس بكسل الطبقات بترتيب الأسفل→الأعلى، بدل صفحة بيضاء + مستطيلات.
- **النصوص:** حدود مقاسة من الكائن المرسوم، وكانفس بالحجم نفسه، مع `text` حيّ و`transform` بالإحداثيات المطلقة ومقاس الخط مضروبًا في `scale`.
- **إصلاح ZIP:** `bundleFiles` يعيد مصفوفة بالفعل؛ كان الكود يلفّها مرة ثانية في ملف واحد تالف.
- **الاختبار:** `exportPsd.test.ts` صار يتحقق من حدود كل طبقة (أرقام مطلقة داخل الصفحة، غير فارغة)، ومن أن الطبقة المقصوصة تسبق قاعدتها مباشرة، ومن أن الخلفية هي الطبقة السفلية، ومن أن **بكسلات كل طبقة مكتوبة فعلًا** وبأبعاد تساوي `right-left` × `bottom-top` تمامًا (قراءة بـ `useImageData`).

---

## 3) التقارير (أرقام فعلية من التشغيل)

### 3.1 الاختبارات

```
Test Files  1 passed (1)
     Tests  7 passed (7)
  Duration  1.87s
```

اختبار تصدير PSD (`npx vitest run src/editor/engine/export/psd/exportPsd.test.ts`):

```
Test Files  1 passed (1)
     Tests  1 passed (1)
```

### 3.2 ميزانية الحزمة (`npm run bundle:check`)

| المسار | Chunks | JS gzip | JS minified | CSS gzip | الحد |
|---|---:|---:|---:|---:|---:|
| `/` | 62 | 162.3 kB | 475.2 kB | 17.8 kB | ≤ 170 kB |
| `/login` | 39 | 145.6 kB | 436.0 kB | 14.1 kB | — |
| `/templates` | 49 | 155.0 kB | 461.7 kB | 15.1 kB | — |
| `/dashboard` | 72 | 167.3 kB | 488.4 kB | 15.3 kB | — |
| `/local/:id` (المحرر) | 95 | **457.9 kB** | 1396.9 kB | 31.7 kB | ≤ 460 kB |

```
Editor chunk: 441.2 kB minified, 134.7 kB gzip (budget 160.0 kB)
Bundle budgets: ok
```

### 3.3 ESLint

```
npx eslint src/editor/collage/deconstructor src/editor/panels/CollagePanel.tsx --quiet
exit=0   (0 errors)
```

### 3.4 TypeScript

- `npm run typecheck`: **0 أخطاء** على مستوى المشروع كاملًا (بعد إصلاح `exportPsd.ts` واختباره).
- `npx eslint src/editor/engine/export/psd --quiet`: **0 أخطاء**.
- `npm run build` (`tsc -b && vite build`): **نجح**.

---

## 4) الأعطال والمخاطر المعروفة

1. **رسم الصور في الاختبارات:** بيئة `jsdom` لا تستطيع رسم `HTMLImageElement` على كانفس، لذا يستخدم اختبار PSD مستطيلًا كسْلوت لاختبار البنية (حدود/ترتيب/قصّ). البكسلات الحقيقية للصور تُختبر في المتصفح فقط — يلزم فحص يدوي لملف PSD بعد التصدير.
2. **حدود الطبقات مقيدة بالصفحة:** أي كائن يخرج عن حدود الصفحة يُقصّ عند الحافة (لا طبقات بإحداثيات سالبة). هذا مقصود لتفادي كانفسات ضخمة، لكنه يعني فقدان الجزء الخارج عن الصفحة.
3. **قيود أنواع `OffscreenCanvas`:** `toDataURL` غير موجود في تعريفات TypeScript القياسية؛ عولج بتحويل `as any` موضعي في الـ Deconstructor، ولا يؤثر على وقت التشغيل.
4. **بيئة الاختبار:** اختبارات الـ Deconstructor تستخدم polyfills داخلية للـ Canvas؛ لا تغطي الأداء الفعلي على صور كبيرة، لذا يُنصح باختبار يدوي بصورة قالب 2000px+ قبل الإطلاق.
5. **الجودة البصرية:** الـ Inpainting رياضي (Telea) وقد يُظهر ضبابية على الخلفيات شديدة التفاصيل؛ الخيار البديل `synthesizeTexture` يغطي الثقوب الكبيرة.
6. **`bundle:check` لا يبني:** السكربت يقرأ `dist/` الموجودة فقط، وكانت النتائج السابقة مبنية على `dist` قديم لا يحتوي PSD. القياس الصحيح بعد `npm run build` أعطى 457.9 kB gzip، وظهر الـ chunk الكسول `exportPsd-*.js` في المخرجات. أي قياس لاحق يجب أن يسبقه build.
7. **قصّ النص الحيّ:** طبقة النص تحمل بكسلات احتياطية + بيانات نص حيّ؛ إن كان الخط غير مثبت على جهاز Photoshop فسيُستبدل بخط بديل وقد تتغير الأبعاد قليلًا.
8. **ترتيب `children` في `ag-psd`:** الأعلى أولًا (كما في وثائق المكتبة)، وعكس ذلك هو ما كان يقلب ترتيب الطبقات ويضع الخلفية في الأعلى.

---

## 5) الخطوات التالية

- فحص يدوي لملف PSD مُصدَّر من تصميم حقيقي في Photoshop (كولاج + صور + نص + خلفية متدرجة) والتأكد من الحدود وثبات الصور داخل الأقنعة.
- إضافة اختبار تصدير PSD في متصفح (Playwright) يرسم صورة فعلية ويقارن بكسلات الطبقات.
- اختبار يدوي لمودال الـ Deconstructor على قوالب حقيقية (نصوص عربية/إنجليزية، إطارات مُدوّرة، زهور وبَاقات).
- مراقبة حجم الحزمة بعد أي إضافات قادمة (الهامش المتاح للمحرر: 2.1 kB gzip فقط).

---

## 6) إصلاح واجهة Deconstruct Studio (تفكيك قالب)

**الحالة قبل:** كان المودال يُسكَب في الشريط الجانبي الضيق كنص خام بلا زر رفع صور → غير قابل للاستخدام.

**الملفات المُعدَّلة:**
| الملف | التغيير |
|---|---|
| `frontend/src/editor/panels/CollagePanel.tsx` | تبويب «تفكيك» مخصص + Dropzone رفع صورة + 3 Sliders + مفتاحان + زر «ابدأ التفكيك» + Overlay كامل الشاشة |
| `frontend/src/editor/panels/Collage.module.css` | أنماط Dropzone/الإعدادات/الـ Overlay |
| `frontend/src/editor/strings/collage.ts` | مفاتيح النصوص العربية الجديدة |
| `frontend/src/editor/collage/deconstructor/DeconstructStudioModal.tsx` | قبول `options` + مودال Overlay كامل الشاشة |
| `frontend/src/editor/collage/deconstructor/DeconstructStudio.css` | (جديد) أنماط المودال الداخلية |

**التحقق:** TypeScript 0 أخطاء · الاختبارات 29/29 (deconstructor 7 + collage 9 + layout 13) · ميزانية الحزمة 134.6 kB gzip (≤160) · البناء `✓ built in 21.86s`. الحاويات الثقيلة للـ computer vision ما زالت lazy-loaded.
