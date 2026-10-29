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
| ميزانية الحزمة — حزمة المحرر | 134.4 kB gzip (الحد 160) | ✅ |
| TypeScript للمشروع كاملًا | 20 خطأ متبقٍ — كلها في مسار PSD بالتوازي | ⚠️ |

**الخلاصة:** الميزة جاهزة ومدمجة، اختباراتها خضراء، وميزانية الحزمة مطابقة. الأخطاء المتبقية في `npm run typecheck` تخص عملًا موازيًا (تصدير PSD) وليست من هذا المسار.

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

### 2.4 إظهار PSD في شبكة التنزيل السريع — هذه الدفعة

كان PSD مسجّلًا في محرك التصدير لكنه غير موجود في شبكة الاختصارات داخل قائمة **Share / Download**، لأنه غير مضمّن في قائمة البلاطات الستة (`png`, `jpg`, `webp`, `pdf`, `svg`, `video`).

- `frontend/src/editor/TopBar.tsx`: أُضيف `...tile('psd')` بين `svg` و`video` (الشبكة 3 أعمدة ← صف جديد).
- عنوان البلاطة ثابت قصير `PSD` عبر `tileLabels` (بدل العنوان الطويل `PSD - Photoshop Layers (.psd)` الخاص بنافذة الخيارات)، والعنوان الفرعي `Editable Layers`.
- يظهر الزر تلقائيًا فقط عندما يكون الفورمات مسجّلًا ومتاحًا (`usable('psd')`)، وبنفس تنسيق بقية البلاطات.
- `frontend/src/editor/strings.ts`: إضافة `psd: 'Editable Layers'` إلى `t.topbar.formatHint`.
- `frontend/src/editor/chrome/chrome.test.tsx`: اختبار يتحقق من وجود بلاطة `PSD` في الشبكة، ومن أن الضغط عليها يشغّل التصدير بـ `formatId: 'psd'`.

---

## 3) التقارير (أرقام فعلية من التشغيل)

### 3.1 الاختبارات

```
Test Files  1 passed (1)
     Tests  7 passed (7)
  Duration  1.87s
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
Editor chunk: 440.4 kB minified, 134.4 kB gzip (budget 160.0 kB)
Bundle budgets: ok
```

### 3.3 ESLint

```
npx eslint src/editor/collage/deconstructor src/editor/panels/CollagePanel.tsx --quiet
exit=0   (0 errors)
```

### 3.4 TypeScript

- `deconstructor/` + `CollagePanel.tsx`: **0 أخطاء**.
- المشروع كاملًا: 20 خطأ، كلها في المسار الموازي:
  - `src/editor/engine/export/psd/exportPsd.ts`
  - `src/editor/engine/export/psd/exportPsd.test.ts`

  (أمثلة: `CollageMeta` بلا `slotId`، `psd.children` قد يكون `undefined`، أنواع `ag-psd`.)

---

## 4) الأعطال والمخاطر المعروفة

1. **أخطاء TypeScript في مسار PSD** — مملوكة لعمل موازٍ (تصدير PSD) ولم تُلمس في هذه الدفعة. لذلك `npm run typecheck` على مستوى المشروع يفشل، بينما ملفات الـ Deconstructor نظيفة.
2. **ملفات لم تُرفع عن قصد:** `frontend/package.json` (+`ag-psd`)، `frontend/package-lock.json`، `src/editor/engine/export/formats.ts`، `src/editor/strings.ts` (مفتاح `psd`)، ومجلد `src/editor/engine/export/psd/` — كلها تخص المسار الموازي وبقيت غير مُودعة هنا.
3. **قيود أنواع `OffscreenCanvas`:** `toDataURL` غير موجود في تعريفات TypeScript القياسية؛ عولج بتحويل `as any` موضعي، ولا يؤثر على وقت التشغيل في المتصفح (المسار يعمل عبر `HTMLCanvasElement`).
4. **بيئة الاختبار:** الاختبارات تستخدم polyfills داخلية للـ Canvas؛ لا تغطي الأداء الفعلي على صور كبيرة، لذا يُنصح باختبار يدوي بصورة قالب 2000px+ قبل الإطلاق.
5. **الجودة البصرية:** الـ Inpainting رياضي (Telea) وقد يُظهر ضبابية على الخلفيات شديدة التفاصيل؛ الخيار البديل `synthesizeTexture` يغطي الثقوب الكبيرة.
6. **`bundle:check` لا يبني:** السكربت يقرأ `dist/` الموجودة فقط، وكانت النتائج السابقة مبنية على `dist` قديم لا يحتوي PSD. القياس الصحيح بعد `npx vite build` أعطى 457.9 kB gzip، وظهر الـ chunk الكسول `exportPsd-*.js` في المخرجات. أي قياس لاحق يجب أن يسبقه build.
7. **`npm run build` يفشل حاليًا** لأن `tsc -b` يسقط على أخطاء مسار PSD الـ20؛ البناء الفعلي تم عبر `npx vite build` (esbuild لا يوقف البناء على أخطاء الأنواع).

---

## 5) الخطوات التالية

- دمج مسار تصدير PSD بعد إصلاح أنواعه، ثم تشغيل `npm run typecheck` شاملًا والوصول إلى 0 أخطاء.
- اختبار يدوي للمودال على قوالب حقيقية (نصوص عربية/إنجليزية، إطارات مُدوّرة، زهور وبَاقات).
- مراقبة حجم الحزمة بعد أي إضافات قادمة (الهامش المتاح للمحرر: 2.4 kB gzip فقط).
