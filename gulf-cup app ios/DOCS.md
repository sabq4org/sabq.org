# تطبيق «خليجي 27» — iOS

تطبيق مستقل لكأس الخليج العربي 27 (جدة، سبتمبر–أكتوبر 2026).

## البنية

```
gulf-cup app ios/
├── GulfCup.xcodeproj
└── GulfCup/
    ├── GulfCupApp.swift          @main
    ├── Screens/GulfCupView.swift  5 تبويبات
    ├── Components/               UI + RTL
    └── Services/                 Models, Theme, APIClient
```

## API

| Endpoint | الاستخدام |
|----------|-----------|
| `GET /api/gulf-cup/overview` | الهيرو + العدّ التنازلي |
| `GET /api/gulf-cup/fixtures` | الجدول |
| `GET /api/gulf-cup/standings` | المجموعات |
| `GET /api/gulf-cup/teams` | المنتخبات |
| `GET /api/gulf-cup/predictions/*` | مسابقة التوقعات (بركة 50/30/20) |

**Bundle ID:** `com.sabq.gulfcup` · **iOS 17.0+**

## الهوية

أخضر خليجي عميق + ذهبي (مطابق `/gulf-cup` على الويب)، خط IBM Plex Sans Arabic.

## المرجع

مبني على نفس بنية `asian-cup app ios/` و `sports app ios/` — parity مع كأس آسيا وسبق الرياضي.

## Phase 2 (لاحقًا)

- Apple Sign-In + حفظ التوقعات (`POST /api/gulf-cup/predictions`)
- شعار رسمي `gulf-cup-27-emblem.png` في Assets
- Live Activity للمباريات الحية
- صفحات منتخب/مباراة غنية (عند توفر API)
