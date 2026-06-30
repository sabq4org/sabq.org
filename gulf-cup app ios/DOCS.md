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

## Phase 2 (مُنجَز)

- Apple Sign-In → `POST /api/v1/auth/apple` → Bearer في Keychain
- حفظ التوقعات → `POST /api/v1/gulf-cup/predictions`
- توقّع البطل → `POST /api/v1/gulf-cup/predictions/long`
- بطاقة «حسابي» في تبويب المزيد

**Railway:** `GC_PREDICTIONS_ENABLED=true` + `APPLE_GULFCUP_BUNDLE_ID=com.sabq.gulfcup`

## Phase 3 (لاحقًا)

- شعار رسمي `gulf-cup-27-emblem.png`
- Live Activity للمباريات الحية
- Backend: `/gulf-cup/match/:id`, `/team/:id`
