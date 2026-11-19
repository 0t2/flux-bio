# Changelog

What changed in FluxBio, a release at a time, newest first. fluxbio.link shows this file at `/en/changelog/` and is made from it.
If you host your own, you take `main`. Your site says which version it runs, in `version` of `GET /api/state` and at the top of `/llms.txt`, so after updating read the releases above that one. The number says what updating takes: a release that changes the middle number (0.3.4 to 0.4.0) has an "Action needed", and one that changes only the last (0.3.4 to 0.3.5) needs nothing but the deploy.

The format is narrow because a script reads it: `## <version> - YYYY-MM-DD` (newest first), then `### ` and one of Action needed, Security, New, Changed, Fixed (in that order), then `- ` entries on one line each, with only `code` and `[links](https://…)` as markup. `tests/changelog.test.ts` holds it. A change someone using FluxBio would see gets a release of its own, on top, in the same pull request, with its version in `package.json` too: the next minor if it has an Action needed, else the next patch. Leave purely internal work out. The date is the day the change reaches `main`. The headings below 0.3.0 are days without a version, because every site of those days called itself 0.2.1.

## 0.3.1 - 2026-11-19

### جديد
- يخبرك `GET /api/update` بما إذا كان هناك إصدار أحدث من FluxBio: كم إصدارًا يتأخر موقعك، وهل يصلح أحدها مشكلة أمنية أو يتضمن «إجراء مطلوب». لا يُقرأ سجل التغييرات هذا من GitHub إلا عند الطلب. يسأل مساعدك الذكي مرة في كل محادثة، ويخبرك أولًا عندما يكون هناك إصلاح أمني بانتظارك.

## 0.3.0 - 2026-11-19

### جديد
- صار لكل إصدار رقم. يذكر الموقع الإصدار الذي يعمل به في `version` ضمن `GET /api/state` وفي بداية `/llms.txt`، وكل عنوان في هذه الصفحة هو إصدار. يدل الرقم على ما يتطلبه التحديث: إذا تغيّر الرقم الأوسط (من 0.3.4 إلى 0.4.0) ففيه «إجراء مطلوب»، وإذا تغيّر الرقم الأخير فقط فيكفي النشر. الموقع الذي ما زال يعرض 0.2.1 أقدم من هذا الإصدار، فاعتمد على تاريخ آخر تحديث له. [#41](https://github.com/0t2/flux-bio/pull/41)

## 2026-11-17

### جديد
- سجل التغيير هذا، هنا وفي [fluxbio.link](https://fluxbio.link/en/changelog/).

## 2026-11-11

### إجراء مطلوب
- قم بالتحديث وإعادة النشر للحصول على إصلاح كلمة مرور الارتباط أدناه. لا شيء آخر يتغير في موقعك. [#38](https://github.com/0t2/flux-bio/pull/38)

### الأمان
- يمكن تخطي كلمة المرور الموجودة على رابط الصفحة: يتم الرد على عنوان الصفحة `/_c/<handle>/<id>/link` بالعنوان الحقيقي للرابط. الرابط الذي يمر زره عبر الرابط القصير الخاص به (كلمة المرور، العنوان المخفي، عناوين الجهاز، علامات UTM) لم يعد يتم توزيعه أو احتسابه هناك. [#38](https://github.com/0t2/flux-bio/pull/38)

### إصلاحات
- لم تصل كلمة مرور الرابط الصحيح مطلقًا إلى الوجهة في Chromium. [#38](https://github.com/0t2/flux-bio/pull/38)
- لم يعد النشر يسقط ما تم كتابته بعد النقر، ولم يعد يتم رفض الحفظ التلقائي أثناء النشر. [#38](https://github.com/0t2/flux-bio/pull/38)
- يرسل كل مفتاح إعدادات في لوحة المعلومات ما يغيره فقط. في السابق، كان من الممكن أن يؤدي التبديل إلى التراجع عن ما قام الذكاء الاصطناعي الخاص بالمالك بتعيينه منذ ذلك الحين، بما في ذلك النطاق والمنطقة الزمنية. [#38](https://github.com/0t2/flux-bio/pull/38)
- يمكن أن يؤدي مسح موقع إلى ترك قاعدة بيانات بدون جداول عندما ترفض KV الحذف، وبعد تجاوز مفاتيح 5000 KV توقفت وقالت إن الأمر قد تم. [#38](https://github.com/0t2/flux-bio/pull/38)

## 2026-11-09

### تغييرات
- يُسمى مفتاح الإعدادات بالروابط القصيرة فقط، ويعني تشغيله إيقاف تشغيل الصفحات الحيوية. تم تسميته على اسم صفحات السيرة الذاتية ولكنه وصف ما يفعله إيقاف تشغيله، لذلك يقرأه مالك موقع الروابط القصيرة فقط بشكل عكسي. [#37](https://github.com/0t2/flux-bio/pull/37)

### إصلاحات
- فشل `pnpm dev` في البدء لأن `cloudflare.config.ts` قام باستيراد وحدة نمطية يستوردها العامل أيضًا. [#36](https://github.com/0t2/flux-bio/pull/36)

## 2026-11-07

### إجراء مطلوب
- إذا قمت بشحن صورك كملفات ثابتة مع `pnpm deploy:images`، فقم بنشر هذا الإصدار ثم قم بتشغيله مرة أخرى: فهو الآن يقرأ صور كل موقع من خلال `GET /api/media/{id}` الجديد ويعيد إنشاء الحزمة منها. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)، [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)

### الأمان
- يرتبط فحص النطاق المخصص باسم المضيف الذي تم السؤال عنه، لذلك لا يمكن تمرير التحقق الذي تمت الإجابة عليه لاسم مضيف لآخر. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)
- في العامل الذي يحتوي على أكثر من موقع واحد، يتم الآن حفظ صور كل موقع، والتي يتم شحنها كملفات ثابتة، في مجلد ذلك الموقع، ويتم عرض الموقع الخاص به فقط في `/media/<id>`. في السابق، كانت جميع المواقع تشترك في مجلد واحد. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### جديد
- `GET /api/media/{id}` يعطي البايتات الحالية للصورة إلى رمز مميز، وللنسخ الاحتياطية و`pnpm deploy:images`. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### تغييرات
- يقوم `pnpm deploy:images` بتنزيل كل صورة في كل مرة، نظرًا لأن التحميل أو الاستعادة يمكن أن يحل محل المعرف، ويتحقق من الموقع والوضع الذي يقرأه قبل التنزيل. [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)
- يتم نسخ الدليل الذي يقرأه الذكاء الاصطناعي للمالك احتياطيًا بنسبة `GET /api/media/{id}` في مجلد لقطة، ولا يتم استبداله مطلقًا، ويقوم بإعداد الصفحة الأولى بترتيب محدد. [8db0091](https://github.com/0t2/flux-bio/commit/8db00919d305b3d41ea5fb2a8637f56e382a87ad)

## 2026-11-06

### إجراء مطلوب
- إذا تم فتح قاعدة بياناتك آخر مرة بواسطة إصدار قبل `7b0bad4` من هذا اليوم، فقم بنشر الإصدار قبل عملية السحق (`8d0c435`) أولاً وافتح الموقع مرة واحدة، ثم قم بنشر هذا الإصدار. تم سحق عمليات الترحيل في عملية واحدة، ويتم الآن التعامل مع قاعدة البيانات التي قامت بتشغيل أقل من عشرة من عمليات الترحيل القديمة (`SELECT value FROM _meta WHERE key = 'schema_version'` أقل من 10) على أنها محدثة، لذلك ستفتقد الأعمدة والفهارس. لن تتأثر عمليات التثبيت وقواعد البيانات الجديدة عند الإصدار 10. [#27](https://github.com/0t2/flux-bio/pull/27)
- استخدم pnpm 10.34.5 أو الأحدث للتثبيت. يقوم المشروع الآن بتسمية pnpm 12.18.0 في `package.json`، ويتوقف pnpm الأقدم بـ "فشل تبديل pnpm". يقوم المثبت في `AGENTS.md` باستبداله، وتغيير خطواته (`pnpm runtime set node 24 --global`، `bin` في المجلد pnpm). إعدادات pnpm موجودة الآن في `pnpm-workspace.yaml`. [#19](https://github.com/0t2/flux-bio/pull/19)

### الأمان
- تقوم صفحات الروابط بتحميل الصور فقط من الموقع نفسه (بالإضافة إلى الصور المصغرة لموقع YouTube على صفحة تحتوي على فيديو)، حيث يتم تحميلها من أي عنوان https. [#32](https://github.com/0t2/flux-bio/pull/32)
- تتم قراءة CSS الخاصة بالصفحة بينما يقرأها المتصفح قبل قبولها، وقد يقوم بتحميل الصور الخاصة بالموقع فقط. [#32](https://github.com/0t2/flux-bio/pull/32)

### جديد
- عدة مواقع في عامل واحد، لكل منها قاعدة بيانات خاصة به، KV، إحصائيات، إعدادات ومجال، مدرجة في `sites.json`. وبدون هذا الملف، يكون العامل موقعًا واحدًا، كما كان من قبل. [#23](https://github.com/0t2/flux-bio/pull/23)
- قم بتضمين الكتل التي تفتح لوحة Ko-fi أو Calendly فوق الصفحة بنقرة واحدة، وزرًا عائمًا لأي منهما. لا شيء يتم تحميله منهم قبل الصنبور. [#28](https://github.com/0t2/flux-bio/pull/28)
- يمكن للذكاء الاصطناعي الخاص بالمالك أن يمنح صفحة روابط CSS خاصة به (`appearance.css`)، لذلك يحتفظ "اجعل صفحتي تبدو مثل هذه الصورة" بصفحة الروابط. [#32](https://github.com/0t2/flux-bio/pull/32)
- يمكن تكرار خلفية الصفحة بحجم محدد للأنماط (`appearance.bgTile`). [#29](https://github.com/0t2/flux-bio/pull/29)
- يمكن أن تتبع الرموز الاجتماعية الروابط (`appearance.socialPlace`)، ويمكن إخفاء الاسم مع الاحتفاظ به كعنوان للصفحة (`appearance.showName`). [#33](https://github.com/0t2/flux-bio/pull/33)
- يمكن إدراج وحذف الصور التي لا تستخدم أي شيء: `GET` و`DELETE /api/media/unused`. [#8](https://github.com/0t2/flux-bio/pull/8)
- تعرض الإعدادات الخطة وحجم قاعدة البيانات والاستخدام اليومي للحصة المجانية، ويقوم `pnpm usage` بقراءتها من الحساب. [8f40792](https://github.com/0t2/flux-bio/commit/8f407922b1f922dddb838f507ba81d228806a2f7)، [2620cf6](https://github.com/0t2/flux-bio/commit/2620cf6d7db9634623c6bef79c7cddf0cf0c5bd1)
- يتم الاحتفاظ بالإحصائيات اليومية لمدة 13 شهرًا، ثم يتم دمجها في صف واحد شهريًا، ويمكن تنزيل كل إحصاء كملف CSV. [7b0bad4](https://github.com/0t2/flux-bio/commit/7b0bad45a93a102bf11a88a79e2285010d79918c)
- يقوم `pnpm deploy:images` بإرسال صور الموقع كملفات ثابتة، والتي لا تكلف أي طلب عامل أو قراءة KV. [71b9ed2](https://github.com/0t2/flux-bio/commit/71b9ed2817ff71c76bad9622f82e60ec9a487ac2)
- نموذج مشكلة لطلب كتلة جديدة. [#31](https://github.com/0t2/flux-bio/pull/31)
- يحتوي Fluxbio.link على أداة تقدير لحركة المرور والتكلفة. [fec68c7](https://github.com/0t2/flux-bio/commit/fec68c70d24ae048eee847bf8f8d1cf79b27c504)

### تغييرات
- لا توجد حدود للصفحات أو الروابط القصيرة: لا شيء ينتظره الزائر أو المالك يقرأ جدولًا كاملاً، وتقوم لوحة المعلومات بتحميل الروابط القصيرة على الشاشة في كل مرة. [4ab8ab7](https://github.com/0t2/flux-bio/commit/4ab8ab7a8a17fa44d457c3b94802e6e65899a2b2)
- أرخص في التشغيل: يستغرق عرض الصفحة قراءة كيلو فولت واحدة، وتجتمع استعلامات D1 التي لا تعتمد على بعضها البعض معًا، وتطلب لوحة المعلومات من العامل مبلغًا أقل، ويستغرق عرض الصفحة حوالي ثلث وحدة المعالجة المركزية. [#6](https://github.com/0t2/flux-bio/pull/6)، [#7](https://github.com/0t2/flux-bio/pull/7)، [#17](https://github.com/0t2/flux-bio/pull/17)، [#18](https://github.com/0t2/flux-bio/pull/18)
- تطلب الصفحات ومعاينة لوحة المعلومات من Google خطًا صينيًا يحتوي على الأحرف التي تظهرها فقط، وليس الخط بأكمله. [#9](https://github.com/0t2/flux-bio/pull/9)، [#13](https://github.com/0t2/flux-bio/pull/13)
- اختفى الرمز الذي يقرأ البيانات المحفوظة في الأشكال القديمة: الإعدادات القديمة وأشكال الصفحات وملفات النسخ الاحتياطي القديمة و`ADMIN_TOKEN` والصفحة `/shorten` وعناوين لوحة المعلومات القديمة. [#27](https://github.com/0t2/flux-bio/pull/27)
- تقوم المطالبة التي تقوم بتثبيت FluxBio بتنزيل الكود أولاً وتجعل الوكيل يقرأ `AGENTS.md` من المجلد، بجميع اللغات الـ 13. [#21](https://github.com/0t2/flux-bio/pull/21)
- يتم تقسيم الدليل الذي يقرأه الذكاء الاصطناعي الخاص بالمالك إلى دليل رئيسي قصير وموضوعات يتم قراءتها عند الحاجة، ويوضح كيفية تلوين أزرار كل سمة، وكيفية تحميل الخطوط وكيفية إنشاء نمط. [#30](https://github.com/0t2/flux-bio/pull/30)، [#34](https://github.com/0t2/flux-bio/pull/34)
- يحدث النشر من GitHub Actions لموقع FluxBio فقط في هذا المستودع وفقط عندما يقوم بتسمية موقع. نسخة تنشر شيئا. [#14](https://github.com/0t2/flux-bio/pull/14)

### إصلاحات
- فشل حفظ المجال المخصص مع 522 لكل مجال كان من المفترض تأكيده. [#35](https://github.com/0t2/flux-bio/pull/35)
- صفحة منشورة قبل وجود `appearance.css` أجابت بـ 500 حتى تم نشرها مرة أخرى. [#32](https://github.com/0t2/flux-bio/pull/32)
- لم تعد لوحة المعلومات تضع انتهاكًا لـ CSP في وحدة تحكم المتصفح عند كل عملية تحميل. [#20](https://github.com/0t2/flux-bio/pull/20)
- إصلاحات لإعادة إنشاء صفحة من لقطات الشاشة بواسطة الذكاء الاصطناعي: محددات سمات CSS على العناوين، و`null` للغلاف وصور الخلفية في `POST /api/themes`، وأسماء السمات بلغة المالك من `GET /api/themes/community?lang=`. [#33](https://github.com/0t2/flux-bio/pull/33)

## 2026-11-05

### جديد
- الإصدار العام الأول: الرابط في السيرة الذاتية، والروابط القصيرة وتتبع النقرات على عامل Cloudflare واحد، يتم تشغيله بواسطة الذكاء الاصطناعي الخاص بالمالك. [1a2f552](https://github.com/0t2/flux-bio/commit/1a2f552a2ebbb3b29284a366ac6f56ea2dfa8056)

