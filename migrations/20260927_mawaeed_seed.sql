-- مواعيدك: إدخال أول مطابق لـ scripts/seed-mawaeed.ts
-- Idempotent. لا يعدّل صفًا موجودًا. hijri_label و public_note يبقيان NULL كما في السكربت.
-- content_updated_at = 2026-09-27T00:00:00.000+03:00

INSERT INTO mawaeed_series (slug, kind, title_ar, summary_ar, sort_order, published, content_updated_at)
VALUES (
  'school-calendar-1448',
  'school_holiday',
  'التقويم الدراسي 1448',
  'إجازات العام الدراسي 1448-1449هـ حسب وزارة التعليم. الإجازات الإضافية تختلف بين المناطق، والافتراضي هنا الرياض.',
  1,
  true,
  '2026-09-27T00:00:00.000+03:00'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO mawaeed_series (slug, kind, title_ar, summary_ar, sort_order, published, content_updated_at)
VALUES (
  'citizen-account',
  'citizen_account',
  'حساب المواطن',
  'موعد إيداع دعم حساب المواطن. اليوم المعتاد هو 10 من الشهر الميلادي حسب سجل إيداعات البرنامج، ويُحدَّث عند إعلان الدفعة.',
  2,
  true,
  '2026-09-27T00:00:00.000+03:00'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO mawaeed_series (slug, kind, title_ar, summary_ar, sort_order, published, content_updated_at)
VALUES (
  'salaries',
  'salary',
  'رواتب موظفي الدولة',
  'موعد صرف رواتب موظفي الدولة المدنيين والعسكريين حسب جدول وزارة المالية: يوم 27 ميلادي، وإن وافق الجمعة فالخميس قبله، وإن وافق السبت فالأحد بعده. معاشات المتقاعدين في قسم التقاعد.',
  3,
  true,
  '2026-09-27T00:00:00.000+03:00'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO mawaeed_series (slug, kind, title_ar, summary_ar, sort_order, published, content_updated_at)
VALUES (
  'social-security',
  'social_security',
  'الضمان الاجتماعي المطوّر',
  'حسب وزارة الموارد البشرية: تُعلن الأهلية يوم 27 من كل شهر ميلادي، ويُصرف المعاش للمؤهلين في اليوم الأول من الشهر.',
  4,
  true,
  '2026-09-27T00:00:00.000+03:00'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO mawaeed_series (slug, kind, title_ar, summary_ar, sort_order, published, content_updated_at)
VALUES (
  'pensions',
  'pension',
  'معاشات التقاعد',
  'مواعيد صرف معاشات التقاعد المدني والعسكري والتأمينات الاجتماعية حسب جدول المؤسسة العامة للتأمينات الاجتماعية.',
  5,
  true,
  '2026-09-27T00:00:00.000+03:00'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'school-calendar-1448'),
  'school-calendar-1448|2026-10-25|الإجازة الإضافية الأولى (القصيم والرياض ومعظم المناطق)',
  'الإجازة الإضافية الأولى (القصيم والرياض ومعظم المناطق)',
  '2026-10-25',
  NULL,
  'https://sites.moe.gov.sa/Qassim/news/news-1136/',
  'الإدارة العامة للتعليم بمنطقة القصيم (موقع وزارة التعليم)',
  'confirmed',
  'scheduled',
  true,
  'riyadh_most',
  NULL,
  NULL,
  '[الأحد] إجازة إضافية تعلنها كل إدارة تعليم لمنطقتها. التاريخ من إنفوجرافيك تعليم القصيم الرسمي (نُشر 2026-08-26). تعليم الرياض أعلن التواريخ الأربعة نفسها عبر حسابه في X (نقلته سبق: https://sabq.org/article/aeKJ7gn — رابط التغريدة الأصلية يُستكمل). مكة والمدينة وجدة والطائف لها تقويم مستقل. تصنع عطلة مطولة من الجمعة 23 إلى الأحد 25 أكتوبر',
  0
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'school-calendar-1448'),
  'school-calendar-1448|2026-10-25|الإجازة الإضافية (مكة المكرمة والمدينة المنورة وجدة والطائف)',
  'الإجازة الإضافية (مكة المكرمة والمدينة المنورة وجدة والطائف)',
  '2026-10-25',
  NULL,
  'https://www.moe.gov.sa/ar/mediacenter/MOEnews/Pages/news1_05082025.aspx',
  'وزارة التعليم — بيان الفصلين الدراسيين وصلاحيات إدارات مكة والمدينة والطائف وجدة',
  'unverified',
  'scheduled',
  false,
  'western',
  NULL,
  NULL,
  '[الأحد] تقارير إعلامية تقول إن هذه المناطق اعتمدت إجازة إضافية واحدة يوم 25 أكتوبر فقط، ولم نجد صفحة رسمية لإداراتها بعد. الوزارة تمنح هذه الإدارات صلاحيات تقويم خاصة (بيان 2025-08-05)',
  1
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'school-calendar-1448'),
  'school-calendar-1448|2026-11-20|إجازة الخريف',
  'إجازة الخريف',
  '2026-11-20',
  NULL,
  'https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx',
  'وزارة التعليم — صفحة التقويم الدراسي (مصدر بياناتها الرسمي AcademicCalendar.aspx)',
  'confirmed',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الجمعة] تاريخ البداية من الوزارة. تاريخ النهاية/العودة (حتى 28 نوفمبر 2026) ورد في بيان الوزارة 2025-08-05 كما نقلته أرقام وسبق، ولا يظهر في بيانات moe.gov.sa (التي تنشر تاريخ البداية فقط) — النهاية تحتاج تحقق. بيانات الوزارة: https://www.moe.gov.sa/ar/education/generaleducation/DataSources/AcademicCalendar.aspx?Year=1448 (وYear=1449)',
  2
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'school-calendar-1448'),
  'school-calendar-1448|2026-11-29|الإجازة الإضافية الثانية (القصيم والرياض ومعظم المناطق)',
  'الإجازة الإضافية الثانية (القصيم والرياض ومعظم المناطق)',
  '2026-11-29',
  NULL,
  'https://sites.moe.gov.sa/Qassim/news/news-1136/',
  'الإدارة العامة للتعليم بمنطقة القصيم (موقع وزارة التعليم)',
  'confirmed',
  'scheduled',
  true,
  'riyadh_most',
  NULL,
  NULL,
  '[الأحد] إجازة إضافية تعلنها كل إدارة تعليم لمنطقتها. التاريخ من إنفوجرافيك تعليم القصيم الرسمي (نُشر 2026-08-26). تعليم الرياض أعلن التواريخ الأربعة نفسها عبر حسابه في X (نقلته سبق: https://sabq.org/article/aeKJ7gn — رابط التغريدة الأصلية يُستكمل). مكة والمدينة وجدة والطائف لها تقويم مستقل. تأتي بعد إجازة الخريف مباشرة',
  3
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'school-calendar-1448'),
  'school-calendar-1448|2027-01-07|الإجازة الإضافية الثالثة (القصيم والرياض ومعظم المناطق)',
  'الإجازة الإضافية الثالثة (القصيم والرياض ومعظم المناطق)',
  '2027-01-07',
  NULL,
  'https://sites.moe.gov.sa/Qassim/news/news-1136/',
  'الإدارة العامة للتعليم بمنطقة القصيم (موقع وزارة التعليم)',
  'confirmed',
  'scheduled',
  true,
  'riyadh_most',
  NULL,
  NULL,
  '[الخميس] إجازة إضافية تعلنها كل إدارة تعليم لمنطقتها. التاريخ من إنفوجرافيك تعليم القصيم الرسمي (نُشر 2026-08-26). تعليم الرياض أعلن التواريخ الأربعة نفسها عبر حسابه في X (نقلته سبق: https://sabq.org/article/aeKJ7gn — رابط التغريدة الأصلية يُستكمل). مكة والمدينة وجدة والطائف لها تقويم مستقل. تسبق إجازة منتصف العام بيوم',
  4
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'school-calendar-1448'),
  'school-calendar-1448|2027-01-08|إجازة منتصف العام الدراسي',
  'إجازة منتصف العام الدراسي',
  '2027-01-08',
  NULL,
  'https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx',
  'وزارة التعليم — صفحة التقويم الدراسي (مصدر بياناتها الرسمي AcademicCalendar.aspx)',
  'confirmed',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الجمعة] تاريخ البداية من الوزارة. تاريخ النهاية/العودة (حتى 16 يناير 2027) ورد في بيان الوزارة 2025-08-05 كما نقلته أرقام وسبق، ولا يظهر في بيانات moe.gov.sa (التي تنشر تاريخ البداية فقط) — النهاية تحتاج تحقق. بيانات الوزارة: https://www.moe.gov.sa/ar/education/generaleducation/DataSources/AcademicCalendar.aspx?Year=1448 (وYear=1449)',
  5
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'school-calendar-1448'),
  'school-calendar-1448|2027-02-19|إجازة يوم التأسيس',
  'إجازة يوم التأسيس',
  '2027-02-19',
  NULL,
  'https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx',
  'وزارة التعليم — صفحة التقويم الدراسي (مصدر بياناتها الرسمي AcademicCalendar.aspx)',
  'confirmed',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الجمعة] تاريخ البداية من الوزارة. تاريخ النهاية/العودة (حتى 22 فبراير 2027) ورد في بيان الوزارة 2025-08-05 كما نقلته أرقام وسبق، ولا يظهر في بيانات moe.gov.sa (التي تنشر تاريخ البداية فقط) — النهاية تحتاج تحقق. بيانات الوزارة: https://www.moe.gov.sa/ar/education/generaleducation/DataSources/AcademicCalendar.aspx?Year=1448 (وYear=1449)',
  6
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'school-calendar-1448'),
  'school-calendar-1448|2027-02-26|إجازة عيد الفطر',
  'إجازة عيد الفطر',
  '2027-02-26',
  NULL,
  'https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx',
  'وزارة التعليم — صفحة التقويم الدراسي (مصدر بياناتها الرسمي AcademicCalendar.aspx)',
  'confirmed',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الجمعة] تاريخ البداية من الوزارة. تاريخ النهاية/العودة (حتى 13 مارس 2027) ورد في بيان الوزارة 2025-08-05 كما نقلته أرقام وسبق، ولا يظهر في بيانات moe.gov.sa (التي تنشر تاريخ البداية فقط) — النهاية تحتاج تحقق. بيانات الوزارة: https://www.moe.gov.sa/ar/education/generaleducation/DataSources/AcademicCalendar.aspx?Year=1448 (وYear=1449)',
  7
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'school-calendar-1448'),
  'school-calendar-1448|2027-04-11|الإجازة الإضافية الرابعة (القصيم والرياض ومعظم المناطق)',
  'الإجازة الإضافية الرابعة (القصيم والرياض ومعظم المناطق)',
  '2027-04-11',
  NULL,
  'https://sites.moe.gov.sa/Qassim/news/news-1136/',
  'الإدارة العامة للتعليم بمنطقة القصيم (موقع وزارة التعليم)',
  'confirmed',
  'scheduled',
  true,
  'riyadh_most',
  NULL,
  NULL,
  '[الأحد] إجازة إضافية تعلنها كل إدارة تعليم لمنطقتها. التاريخ من إنفوجرافيك تعليم القصيم الرسمي (نُشر 2026-08-26). تعليم الرياض أعلن التواريخ الأربعة نفسها عبر حسابه في X (نقلته سبق: https://sabq.org/article/aeKJ7gn — رابط التغريدة الأصلية يُستكمل). مكة والمدينة وجدة والطائف لها تقويم مستقل. تصنع عطلة مطولة من الجمعة 9 إلى الأحد 11 أبريل',
  8
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'school-calendar-1448'),
  'school-calendar-1448|2027-05-07|إجازة عيد الأضحى',
  'إجازة عيد الأضحى',
  '2027-05-07',
  NULL,
  'https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx',
  'وزارة التعليم — صفحة التقويم الدراسي (مصدر بياناتها الرسمي AcademicCalendar.aspx)',
  'confirmed',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الجمعة] تاريخ البداية من الوزارة. تاريخ النهاية/العودة (حتى 22 مايو 2027) ورد في بيان الوزارة 2025-08-05 كما نقلته أرقام وسبق، ولا يظهر في بيانات moe.gov.sa (التي تنشر تاريخ البداية فقط) — النهاية تحتاج تحقق. بيانات الوزارة: https://www.moe.gov.sa/ar/education/generaleducation/DataSources/AcademicCalendar.aspx?Year=1448 (وYear=1449)',
  9
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'school-calendar-1448'),
  'school-calendar-1448|2027-06-24|بداية إجازة نهاية العام الدراسي 1448-1449هـ',
  'بداية إجازة نهاية العام الدراسي 1448-1449هـ',
  '2027-06-24',
  NULL,
  'https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx',
  'وزارة التعليم — صفحة التقويم الدراسي (مصدر بياناتها الرسمي AcademicCalendar.aspx)',
  'confirmed',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الخميس] نص الوزارة: «بداية إجازة نهاية العام الدراسي - نهاية دوام يوم الخميس». بيانات الوزارة: https://www.moe.gov.sa/ar/education/generaleducation/DataSources/AcademicCalendar.aspx?Year=1448 (وYear=1449)',
  10
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'school-calendar-1448'),
  'school-calendar-1448|2027-08-15|عودة المعلمين للعام الدراسي 1449-1450هـ',
  'عودة المعلمين للعام الدراسي 1449-1450هـ',
  '2027-08-15',
  NULL,
  'https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx',
  'وزارة التعليم — صفحة التقويم الدراسي (مصدر بياناتها الرسمي AcademicCalendar.aspx)',
  'confirmed',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الأحد] نص الوزارة: «عودة المعلمين الممارسين للتدريس في جميع المراحل الدراسية». بيانات الوزارة: https://www.moe.gov.sa/ar/education/generaleducation/DataSources/AcademicCalendar.aspx?Year=1448 (وYear=1449)',
  11
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'school-calendar-1448'),
  'school-calendar-1448|2027-08-22|بداية العام الدراسي 1449-1450هـ (عودة الطلاب)',
  'بداية العام الدراسي 1449-1450هـ (عودة الطلاب)',
  '2027-08-22',
  NULL,
  'https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx',
  'وزارة التعليم — صفحة التقويم الدراسي (مصدر بياناتها الرسمي AcademicCalendar.aspx)',
  'confirmed',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الأحد] بيانات الوزارة: https://www.moe.gov.sa/ar/education/generaleducation/DataSources/AcademicCalendar.aspx?Year=1448 (وYear=1449)',
  12
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'salaries'),
  'salaries|2026-09-27|رواتب موظفي الدولة — سبتمبر 2026 (اليوم)',
  'رواتب موظفي الدولة — سبتمبر 2026 (اليوم)',
  '2026-09-27',
  NULL,
  'https://www.mof.gov.sa/mediacenter/Payroll/Pages/2026.aspx',
  'وزارة المالية — مواعيد صرف الرواتب لعام 2026',
  'confirmed',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الأحد] من جدول الوزارة. قاعدة الوزارة: الصرف يوم 27 ميلادي؛ إن وافق الجمعة فالخميس قبله، وإن وافق السبت فالأحد بعده',
  13
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'salaries'),
  'salaries|2026-10-27|رواتب موظفي الدولة — أكتوبر 2026',
  'رواتب موظفي الدولة — أكتوبر 2026',
  '2026-10-27',
  NULL,
  'https://www.mof.gov.sa/mediacenter/Payroll/Pages/2026.aspx',
  'وزارة المالية — مواعيد صرف الرواتب لعام 2026',
  'confirmed',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الثلاثاء] من جدول الوزارة. قاعدة الوزارة: الصرف يوم 27 ميلادي؛ إن وافق الجمعة فالخميس قبله، وإن وافق السبت فالأحد بعده',
  14
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'salaries'),
  'salaries|2026-11-26|رواتب موظفي الدولة — نوفمبر 2026',
  'رواتب موظفي الدولة — نوفمبر 2026',
  '2026-11-26',
  NULL,
  'https://www.mof.gov.sa/mediacenter/Payroll/Pages/2026.aspx',
  'وزارة المالية — مواعيد صرف الرواتب لعام 2026',
  'confirmed',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الخميس] من جدول الوزارة (27 نوفمبر جمعة، فقُدّم إلى الخميس). قاعدة الوزارة: الصرف يوم 27 ميلادي؛ إن وافق الجمعة فالخميس قبله، وإن وافق السبت فالأحد بعده',
  15
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'salaries'),
  'salaries|2026-12-27|رواتب موظفي الدولة — ديسمبر 2026',
  'رواتب موظفي الدولة — ديسمبر 2026',
  '2026-12-27',
  NULL,
  'https://www.mof.gov.sa/mediacenter/Payroll/Pages/2026.aspx',
  'وزارة المالية — مواعيد صرف الرواتب لعام 2026',
  'confirmed',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الأحد] من جدول الوزارة. قاعدة الوزارة: الصرف يوم 27 ميلادي؛ إن وافق الجمعة فالخميس قبله، وإن وافق السبت فالأحد بعده',
  16
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'salaries'),
  'salaries|2027-01-27|رواتب موظفي الدولة — يناير 2027',
  'رواتب موظفي الدولة — يناير 2027',
  '2027-01-27',
  NULL,
  'https://www.mof.gov.sa/mediacenter/Payroll/Pages/2026.aspx',
  'وزارة المالية — مواعيد صرف الرواتب لعام 2026',
  'expected',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الأربعاء] محسوب من القاعدة الرسمية؛ جدول 2027 لم يُنشر بعد (صفحة 2027.aspx تعطي 404 في 2026-09-27). يُطابق عند النشر. قاعدة الوزارة: الصرف يوم 27 ميلادي؛ إن وافق الجمعة فالخميس قبله، وإن وافق السبت فالأحد بعده',
  17
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'salaries'),
  'salaries|2027-02-28|رواتب موظفي الدولة — فبراير 2027',
  'رواتب موظفي الدولة — فبراير 2027',
  '2027-02-28',
  NULL,
  'https://www.mof.gov.sa/mediacenter/Payroll/Pages/2026.aspx',
  'وزارة المالية — مواعيد صرف الرواتب لعام 2026',
  'expected',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الأحد] محسوب من القاعدة الرسمية: 27 فبراير سبت، فيُصرف الأحد 28. جدول 2027 لم يُنشر بعد. قاعدة الوزارة: الصرف يوم 27 ميلادي؛ إن وافق الجمعة فالخميس قبله، وإن وافق السبت فالأحد بعده',
  18
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'salaries'),
  'salaries|2027-03-28|رواتب موظفي الدولة — مارس 2027',
  'رواتب موظفي الدولة — مارس 2027',
  '2027-03-28',
  NULL,
  'https://www.mof.gov.sa/mediacenter/Payroll/Pages/2026.aspx',
  'وزارة المالية — مواعيد صرف الرواتب لعام 2026',
  'expected',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الأحد] محسوب من القاعدة الرسمية: 27 مارس سبت، فيُصرف الأحد 28. جدول 2027 لم يُنشر بعد. تنبيه: الوزارة خرجت عن القاعدة قبل الأعياد (راتب مايو 2026 صُرف الأحد 24 مايو). قاعدة الوزارة: الصرف يوم 27 ميلادي؛ إن وافق الجمعة فالخميس قبله، وإن وافق السبت فالأحد بعده',
  19
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'citizen-account'),
  'citizen-account|2026-10-10|حساب المواطن — الدفعة 107 (أكتوبر 2026)',
  'حساب المواطن — الدفعة 107 (أكتوبر 2026)',
  '2026-10-10',
  NULL,
  'https://x.com/citizenaccount/status/2097792187396157787',
  'برنامج حساب المواطن — الحساب الرسمي في X (@citizenaccount)',
  'unverified',
  'scheduled',
  false,
  'all',
  NULL,
  NULL,
  '[السبت] محسوب: الإيداع في اليوم 10 من الشهر الميلادي حسب سجل الإيداعات الرسمي في 2026 (يناير–سبتمبر). تعذّر فتح نص القاعدة على ca.gov.sa (خطأ 500). 10 أكتوبر يوافق السبت. لا توجد قاعدة إزاحة معلنة نصًا. في سجل 2026 الرسمي: 10 يناير (سبت) أُودع الأحد 11، و10 أبريل و10 يوليو (جمعة) أُودعا الخميس 9، لذا يُرجَّح الأحد 11 أكتوبر دون إعلان حتى الآن. يُتحقق من تغريدة العد التنازلي (نحو 5 أكتوبر)',
  20
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'citizen-account'),
  'citizen-account|2026-11-10|حساب المواطن — الدفعة 108 (نوفمبر 2026)',
  'حساب المواطن — الدفعة 108 (نوفمبر 2026)',
  '2026-11-10',
  NULL,
  'https://x.com/citizenaccount/status/2097792187396157787',
  'برنامج حساب المواطن — الحساب الرسمي في X (@citizenaccount)',
  'expected',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الثلاثاء] محسوب: الإيداع في اليوم 10 من الشهر الميلادي حسب سجل الإيداعات الرسمي في 2026 (يناير–سبتمبر). تعذّر فتح نص القاعدة على ca.gov.sa (خطأ 500). يوم عمل، فلا حاجة لإزاحة',
  21
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'citizen-account'),
  'citizen-account|2026-12-10|حساب المواطن — الدفعة 109 (ديسمبر 2026)',
  'حساب المواطن — الدفعة 109 (ديسمبر 2026)',
  '2026-12-10',
  NULL,
  'https://x.com/citizenaccount/status/2097792187396157787',
  'برنامج حساب المواطن — الحساب الرسمي في X (@citizenaccount)',
  'expected',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الخميس] محسوب: الإيداع في اليوم 10 من الشهر الميلادي حسب سجل الإيداعات الرسمي في 2026 (يناير–سبتمبر). تعذّر فتح نص القاعدة على ca.gov.sa (خطأ 500). يوم عمل، فلا حاجة لإزاحة',
  22
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'citizen-account'),
  'citizen-account|2027-01-10|حساب المواطن — الدفعة 110 (يناير 2027)',
  'حساب المواطن — الدفعة 110 (يناير 2027)',
  '2027-01-10',
  NULL,
  'https://x.com/citizenaccount/status/2097792187396157787',
  'برنامج حساب المواطن — الحساب الرسمي في X (@citizenaccount)',
  'expected',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الأحد] محسوب: الإيداع في اليوم 10 من الشهر الميلادي حسب سجل الإيداعات الرسمي في 2026 (يناير–سبتمبر). تعذّر فتح نص القاعدة على ca.gov.sa (خطأ 500). يوم عمل، فلا حاجة لإزاحة',
  23
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'citizen-account'),
  'citizen-account|2027-02-10|حساب المواطن — الدفعة 111 (فبراير 2027)',
  'حساب المواطن — الدفعة 111 (فبراير 2027)',
  '2027-02-10',
  NULL,
  'https://x.com/citizenaccount/status/2097792187396157787',
  'برنامج حساب المواطن — الحساب الرسمي في X (@citizenaccount)',
  'expected',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الأربعاء] محسوب: الإيداع في اليوم 10 من الشهر الميلادي حسب سجل الإيداعات الرسمي في 2026 (يناير–سبتمبر). تعذّر فتح نص القاعدة على ca.gov.sa (خطأ 500). يوم عمل (3 رمضان وفق أم القرى)',
  24
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'citizen-account'),
  'citizen-account|2027-03-10|حساب المواطن — الدفعة 112 (مارس 2027)',
  'حساب المواطن — الدفعة 112 (مارس 2027)',
  '2027-03-10',
  NULL,
  'https://x.com/citizenaccount/status/2097792187396157787',
  'برنامج حساب المواطن — الحساب الرسمي في X (@citizenaccount)',
  'unverified',
  'scheduled',
  false,
  'all',
  NULL,
  NULL,
  '[الأربعاء] محسوب: الإيداع في اليوم 10 من الشهر الميلادي حسب سجل الإيداعات الرسمي في 2026 (يناير–سبتمبر). تعذّر فتح نص القاعدة على ca.gov.sa (خطأ 500). 10 مارس 2027 يوافق 2 شوال 1448 وفق أم القرى، أي داخل عطلة عيد الفطر المتوقعة (العيد يثبت بالرؤية)، فقد يُقدَّم الإيداع. لم يُعلن شيء',
  25
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'social-security'),
  'social-security|2026-10-01|الضمان الاجتماعي المطور — معاش أكتوبر 2026',
  'الضمان الاجتماعي المطور — معاش أكتوبر 2026',
  '2026-10-01',
  NULL,
  'https://www.hrsd.gov.sa/media-center/news/%D9%85%D8%B9%D8%A7%D9%8A%D9%8A%D8%B1%C2%A0%D9%88%D8%AE%D8%B7%D9%88%D8%A7%D8%AA-%D9%84%D9%84%D8%A3%D9%87%D9%84%D9%8A%D8%A9',
  'وزارة الموارد البشرية والتنمية الاجتماعية — خبر «الضمان الاجتماعي» 2026-02-05',
  'expected',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الخميس] محسوب: قاعدة الوزارة «صرف المعاش للمؤهلين في اليوم الأول من كل شهر ميلادي» (وإعلان الأهلية يوم 27). يوم عمل',
  26
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'social-security'),
  'social-security|2026-11-01|الضمان الاجتماعي المطور — معاش نوفمبر 2026',
  'الضمان الاجتماعي المطور — معاش نوفمبر 2026',
  '2026-11-01',
  NULL,
  'https://www.hrsd.gov.sa/media-center/news/%D9%85%D8%B9%D8%A7%D9%8A%D9%8A%D8%B1%C2%A0%D9%88%D8%AE%D8%B7%D9%88%D8%A7%D8%AA-%D9%84%D9%84%D8%A3%D9%87%D9%84%D9%8A%D8%A9',
  'وزارة الموارد البشرية والتنمية الاجتماعية — خبر «الضمان الاجتماعي» 2026-02-05',
  'expected',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الأحد] محسوب: قاعدة الوزارة «صرف المعاش للمؤهلين في اليوم الأول من كل شهر ميلادي» (وإعلان الأهلية يوم 27). يوم عمل',
  27
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'social-security'),
  'social-security|2026-12-01|الضمان الاجتماعي المطور — معاش ديسمبر 2026',
  'الضمان الاجتماعي المطور — معاش ديسمبر 2026',
  '2026-12-01',
  NULL,
  'https://www.hrsd.gov.sa/media-center/news/%D9%85%D8%B9%D8%A7%D9%8A%D9%8A%D8%B1%C2%A0%D9%88%D8%AE%D8%B7%D9%88%D8%A7%D8%AA-%D9%84%D9%84%D8%A3%D9%87%D9%84%D9%8A%D8%A9',
  'وزارة الموارد البشرية والتنمية الاجتماعية — خبر «الضمان الاجتماعي» 2026-02-05',
  'expected',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الثلاثاء] محسوب: قاعدة الوزارة «صرف المعاش للمؤهلين في اليوم الأول من كل شهر ميلادي» (وإعلان الأهلية يوم 27). يوم عمل',
  28
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'social-security'),
  'social-security|2027-01-01|الضمان الاجتماعي المطور — معاش يناير 2027',
  'الضمان الاجتماعي المطور — معاش يناير 2027',
  '2027-01-01',
  NULL,
  'https://www.hrsd.gov.sa/media-center/news/%D9%85%D8%B9%D8%A7%D9%8A%D9%8A%D8%B1%C2%A0%D9%88%D8%AE%D8%B7%D9%88%D8%A7%D8%AA-%D9%84%D9%84%D8%A3%D9%87%D9%84%D9%8A%D8%A9',
  'وزارة الموارد البشرية والتنمية الاجتماعية — خبر «الضمان الاجتماعي» 2026-02-05',
  'unverified',
  'scheduled',
  false,
  'all',
  NULL,
  NULL,
  '[الجمعة] محسوب: قاعدة الوزارة «صرف المعاش للمؤهلين في اليوم الأول من كل شهر ميلادي» (وإعلان الأهلية يوم 27). 1 يناير 2027 يوافق الجمعة، ولم نجد قاعدة رسمية لإزاحة العطلة الأسبوعية؛ الموعد الفعلي يُستكمل من الوزارة',
  29
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'social-security'),
  'social-security|2027-02-01|الضمان الاجتماعي المطور — معاش فبراير 2027',
  'الضمان الاجتماعي المطور — معاش فبراير 2027',
  '2027-02-01',
  NULL,
  'https://www.hrsd.gov.sa/media-center/news/%D9%85%D8%B9%D8%A7%D9%8A%D9%8A%D8%B1%C2%A0%D9%88%D8%AE%D8%B7%D9%88%D8%A7%D8%AA-%D9%84%D9%84%D8%A3%D9%87%D9%84%D9%8A%D8%A9',
  'وزارة الموارد البشرية والتنمية الاجتماعية — خبر «الضمان الاجتماعي» 2026-02-05',
  'expected',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الاثنين] محسوب: قاعدة الوزارة «صرف المعاش للمؤهلين في اليوم الأول من كل شهر ميلادي» (وإعلان الأهلية يوم 27). يوم عمل',
  30
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'social-security'),
  'social-security|2027-03-01|الضمان الاجتماعي المطور — معاش مارس 2027',
  'الضمان الاجتماعي المطور — معاش مارس 2027',
  '2027-03-01',
  NULL,
  'https://www.hrsd.gov.sa/media-center/news/%D9%85%D8%B9%D8%A7%D9%8A%D9%8A%D8%B1%C2%A0%D9%88%D8%AE%D8%B7%D9%88%D8%A7%D8%AA-%D9%84%D9%84%D8%A3%D9%87%D9%84%D9%8A%D8%A9',
  'وزارة الموارد البشرية والتنمية الاجتماعية — خبر «الضمان الاجتماعي» 2026-02-05',
  'expected',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الاثنين] محسوب: قاعدة الوزارة «صرف المعاش للمؤهلين في اليوم الأول من كل شهر ميلادي» (وإعلان الأهلية يوم 27). يوم عمل (22 رمضان وفق أم القرى)',
  31
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'pensions'),
  'pensions|2026-10-01|معاشات التقاعد المدني والعسكري والتأمينات — أكتوبر 2026',
  'معاشات التقاعد المدني والعسكري والتأمينات — أكتوبر 2026',
  '2026-10-01',
  NULL,
  'https://x.com/GosiCare/status/2086848891798827379',
  'المؤسسة العامة للتأمينات الاجتماعية — جدول صرف المعاشات 2026 (@SaudiGOSI و@GosiCare)',
  'confirmed',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الخميس] من جدول التأمينات الرسمي «لما تبقى من عام 2026» (نُشر 2026-04-30 وأُعيد نشره 2026-08-10). نسخة أبريل: https://x.com/SaudiGOSI/status/2049866363704095124',
  32
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'pensions'),
  'pensions|2026-11-01|معاشات التقاعد المدني والعسكري والتأمينات — نوفمبر 2026',
  'معاشات التقاعد المدني والعسكري والتأمينات — نوفمبر 2026',
  '2026-11-01',
  NULL,
  'https://x.com/GosiCare/status/2086848891798827379',
  'المؤسسة العامة للتأمينات الاجتماعية — جدول صرف المعاشات 2026 (@SaudiGOSI و@GosiCare)',
  'confirmed',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الأحد] من جدول التأمينات الرسمي 2026',
  33
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'pensions'),
  'pensions|2026-12-01|معاشات التقاعد المدني والعسكري والتأمينات — ديسمبر 2026',
  'معاشات التقاعد المدني والعسكري والتأمينات — ديسمبر 2026',
  '2026-12-01',
  NULL,
  'https://x.com/GosiCare/status/2086848891798827379',
  'المؤسسة العامة للتأمينات الاجتماعية — جدول صرف المعاشات 2026 (@SaudiGOSI و@GosiCare)',
  'confirmed',
  'scheduled',
  true,
  'all',
  NULL,
  NULL,
  '[الثلاثاء] من جدول التأمينات الرسمي 2026',
  34
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'pensions'),
  'pensions|2027-01-01|معاشات التقاعد المدني والعسكري والتأمينات — يناير 2027',
  'معاشات التقاعد المدني والعسكري والتأمينات — يناير 2027',
  '2027-01-01',
  NULL,
  'https://x.com/GosiCare/status/2086848891798827379',
  'المؤسسة العامة للتأمينات الاجتماعية — جدول صرف المعاشات 2026 (@SaudiGOSI و@GosiCare)',
  'unverified',
  'scheduled',
  false,
  'all',
  NULL,
  NULL,
  '[الجمعة] محسوب على نمط جدول 2026 (اليوم الأول ميلادي)، ولم يُنشر جدول 2027. 1 يناير 2027 يوافق الجمعة، وفي 2026 قُدّم معاش أغسطس إلى الخميس 30 يوليو لأن 1 أغسطس سبت؛ لا قاعدة إزاحة مكتوبة',
  35
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'pensions'),
  'pensions|2027-02-01|معاشات التقاعد المدني والعسكري والتأمينات — فبراير 2027',
  'معاشات التقاعد المدني والعسكري والتأمينات — فبراير 2027',
  '2027-02-01',
  NULL,
  'https://x.com/GosiCare/status/2086848891798827379',
  'المؤسسة العامة للتأمينات الاجتماعية — جدول صرف المعاشات 2026 (@SaudiGOSI و@GosiCare)',
  'unverified',
  'scheduled',
  false,
  'all',
  NULL,
  NULL,
  '[الاثنين] محسوب على نمط جدول 2026 (اليوم الأول ميلادي)، ولم يُنشر جدول 2027 ولم نجد نصًا رسميًا للقاعدة الشهرية',
  36
)
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO mawaeed_occurrences (
  series_id, seed_key, title_ar, starts_on, ends_on, source_url, source_title,
  certainty, status, published, region_group, hijri_label, public_note, rule_note, sort_order
) VALUES (
  (SELECT id FROM mawaeed_series WHERE slug = 'pensions'),
  'pensions|2027-03-01|معاشات التقاعد المدني والعسكري والتأمينات — مارس 2027',
  'معاشات التقاعد المدني والعسكري والتأمينات — مارس 2027',
  '2027-03-01',
  NULL,
  'https://x.com/GosiCare/status/2086848891798827379',
  'المؤسسة العامة للتأمينات الاجتماعية — جدول صرف المعاشات 2026 (@SaudiGOSI و@GosiCare)',
  'unverified',
  'scheduled',
  false,
  'all',
  NULL,
  NULL,
  '[الاثنين] محسوب على نمط جدول 2026 (اليوم الأول ميلادي)، ولم يُنشر جدول 2027 ولم نجد نصًا رسميًا للقاعدة الشهرية',
  37
)
ON CONFLICT (seed_key) DO NOTHING;

