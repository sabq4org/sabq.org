> **مستند تاريخي (أُرشف 2026-07-01)** — يصف حالة التطبيق حتى ربيع 2026 ولا يعكس الكود الحالي.
> لا تتّبع تعليماته: الـ Base URL الصحيح اليوم `api.sabq.org` مباشرة (انظر `sabq app ios/sabq/Services/URLConstants.swift`)
> والحد الأدنى iOS 17.0. المرجع الحي: CLAUDE.md وذاكرة المشروع.

# Sabq (سبق) — Design Specification
# This file is a complete UI/UX blueprint for an AI agent to replicate the app exactly.

## Overview
- **App Name:** سبق (Sabq)
- **Platform:** iOS (SwiftUI, minimum iOS 26.2)
- **Language:** Arabic (RTL layout forced via `.environment(\.layoutDirection, .rightToLeft)`)
- **Type:** Saudi local news app
- **Tabs:** 5 tabs — الرئيسية (Home), الأقسام (Sections), البحث (Search), المحفوظات (Bookmarks), المزيد (Settings)

---

## Color System (Dynamic Light/Dark)

All base colors adapt to light/dark mode using `UIColor { traitCollection in }`.

### Base Colors
| Token         | Light Mode                | Dark Mode                 |
|---------------|---------------------------|---------------------------|
| background    | rgb(242, 247, 252)        | rgb(18, 18, 23)           |
| surface       | white                     | rgb(31, 31, 36)           |
| ink           | rgb(26, 26, 36)           | rgb(242, 242, 247)        |
| secondaryInk  | rgb(97, 102, 117)         | rgb(173, 173, 184)        |
| tertiaryInk   | rgb(143, 148, 163)        | rgb(128, 128, 140)        |
| outline       | rgb(224, 230, 237)        | rgb(51, 51, 59)           |
| shadow        | black 5%                  | black 30%                 |
| deepShadow    | black 8%                  | black 40%                 |
| paleFill      | rgb(240, 247, 252)        | rgb(36, 36, 41)           |
| softFill      | rgb(235, 242, 250)        | rgb(41, 41, 46)           |

### Accent Colors (User-Selectable)
The primary accent color is stored in `@AppStorage("appAccent")` and affects `primaryStart` and `primaryEnd` across the entire app.

| Accent   | Light Color            | Dark Color              |
|----------|------------------------|------------------------|
| blue     | rgb(92, 189, 232)      | rgb(115, 204, 245)     |
| teal     | rgb(41, 166, 140)      | rgb(64, 199, 166)      |
| purple   | rgb(140, 89, 217)      | rgb(173, 128, 242)     |
| rose     | rgb(224, 87, 117)      | rgb(242, 122, 148)     |
| orange   | rgb(242, 140, 51)      | rgb(255, 166, 77)      |

### Category-Specific Colors (Fixed)
| Color | RGB |
|-------|-----|
| teal  | rgb(41, 166, 140) |
| sky   | rgb(56, 133, 242) |
| gold  | rgb(235, 173, 51) |
| coral | rgb(230, 89, 82)  |
| leaf  | rgb(102, 186, 56) |

---

## Typography

- **System font** with `.rounded` design for titles/headers
- All text is Arabic — use `.multilineTextAlignment(.leading)` with RTL
- Font size for article body is user-configurable via `@AppStorage("articleFontSize")`, default 17

| Element              | Size | Weight    | Design   |
|----------------------|------|-----------|----------|
| Screen title         | 30   | bold      | rounded  |
| Section header       | 19   | bold      | rounded  |
| Article card title   | 20   | bold      | rounded  |
| Article detail title | fontSize+6 | bold | rounded |
| Body text            | fontSize (17 default) | regular | default |
| Excerpt              | fontSize | medium  | default  |
| Chip label           | 14   | semibold  | default  |
| Tab bar label        | 11   | medium/bold | default |
| Meta/caption         | 12-13 | medium   | default  |
| Status chip          | 12   | semibold  | default  |

---

## Corner Radii

| Token        | Value |
|--------------|-------|
| cardRadius   | 28    |
| tileRadius   | 22    |
| chipRadius   | 14    |
| buttonRadius | 20    |

---

## Spacing & Layout

- **Horizontal padding:** 16pt on all screens
- **Vertical item spacing:** 20pt between major sections
- **Card internal padding:** 20pt
- **Tab bar:** floating at bottom with `.ultraThinMaterial` background, cornerRadius 28

---

## Screens

### 1. Home (الرئيسية)
- **Header:** App logo (left in RTL) + notification bell button (right)
- **Breaking news:** Single article bar with red dot + "عاجل" label + title (max 2 lines). Red-tinted background `coral.opacity(0.04)`.
- **Featured carousel:** 3 articles in `TabView` with `.page` style, height 380pt. No section header above it.
- **Category chips:** Horizontal scroll with "الكل" + all 8 categories. Selected chip uses `brandGradient` fill with white text.
- **Latest articles:** Section header + `SurfaceCard` containing `CompactArticleRow` items with dividers.
- **Pull to refresh:** `.refreshable` modifier enabled.

### 2. Sections (الأقسام)
- **Header:** "الأقسام" with subtitle
- **Category grid:** 2-column `LazyVGrid` with `CategoryTile` items showing icon, count, title, subtitle
- **Trending tags:** `FlowLayout` with capsule-shaped tag buttons
- **Category detail sheet:** Opens as sheet showing hero section + article list

### 3. Search (البحث)
- **Search bar:** Custom `SabqSearchBar` with magnifying glass icon, text field, clear button
- **Empty state:** Recent searches list + suggested topics in `FlowLayout`
- **Results state:** Count header + article list in `SurfaceCard`

### 4. Bookmarks (المحفوظات)
- **Empty state:** Centered icon + title + subtitle
- **With bookmarks:** 3 stat tiles (count, reading time, categories) + article list
- **Stat tiles:** Horizontal row, each with icon + value + label

### 5. Settings (المزيد)
- **Notifications card:** Breaking news toggle + daily summary toggle
- **Display card:**
  - Dark mode toggle (persisted via `@AppStorage("isDarkMode")`, applies `.preferredColorScheme`)
  - Accent color picker: 5 colored circles (blue, teal, purple, rose, orange) with labels
  - Font size slider: range 14–24, step 1, with preview text and size indicator
- **About card:** App description + website + email + twitter rows
- **App info:** Logo + version + "صنع بكل حب في السعودية 🇸🇦"

### 6. Article Detail (تفاصيل الخبر)
- **Hero image:** 260pt height, AsyncImage with placeholder. Gradient overlay at bottom. Category chip + "عاجل" chip overlaid.
- **Meta row:** Author + reading time + date
- **Title:** Bold rounded, size = fontSize + 6
- **Excerpt:** In a rounded rect with primary color tint
- **Body:** Regular weight, size = fontSize, line spacing 8
- **Tags:** "الوسوم" header + FlowLayout with hashtag capsules

---

## Components

### SurfaceCard
- White/dark surface background, cardRadius corners
- Double shadow (soft 16r + hard 1r)
- 0.5pt outline stroke
- Optional accent color circle overlay at top-right

### FeaturedArticleCard
- Image top (200pt) with gradient overlay + chips
- Title + excerpt + meta row below
- Bookmark button

### CompactArticleRow
- Horizontal: text stack (chips + title + meta) | thumbnail (80x80, cornerRadius 16)

### CategoryTile
- Icon badge + count + title + subtitle
- tileRadius corners with shadow

### SabqTabBar
- Floating bar with `.ultraThinMaterial`
- 5 tabs with icon + label + selection indicator (small capsule)
- Spring animation on selection

### CategoryChip
- Capsule shape, selected = gradient fill + white text, unselected = paleFill + outline

### StatusChip
- Small capsule with tinted background (10% opacity)

---

## Data Model

### Article Categories (8)
| Case       | Title    | Icon                  | Tint Color |
|------------|----------|-----------------------|------------|
| local      | محلية    | building.2.fill       | primaryEnd |
| politics   | سياسة    | flag.fill             | primaryStart |
| sports     | رياضة    | sportscourt.fill      | leaf       |
| economy    | اقتصاد   | chart.bar.fill        | gold       |
| technology | تقنية    | cpu.fill              | teal       |
| culture    | ثقافة    | theatermasks.fill     | purple (0.65, 0.40, 0.80) |
| society    | مجتمع    | person.3.fill         | coral      |
| world      | دولية    | globe.americas.fill   | sky        |

### Article Model
```
id, title, excerpt, body, category, source, author, publishDate,
readingMinutes, isBreaking, isFeatured, tags: [String], imageURL: String?
```

---

## Persistence

| Key              | Type   | Default  | Purpose                    |
|------------------|--------|----------|----------------------------|
| isDarkMode       | Bool   | false    | Light/dark mode toggle     |
| appAccent        | String | "blue"   | Accent color selection     |
| articleFontSize  | Double | 17       | Article body font size     |
| sabq_bookmarks_v1 | Data  | []       | Bookmarked article IDs     |

---

## RTL Implementation
- All views wrapped with `.environment(\.layoutDirection, .rightToLeft)` and `.environment(\.locale, Locale(identifier: "ar"))`
- Window-level `semanticContentAttribute = .forceRightToLeft` via UIViewRepresentable
- All text uses `.multilineTextAlignment(.leading)` (which becomes right-aligned in RTL)

---

## Key Design Principles
1. **Arabic-first:** Every string, layout direction, and alignment is designed for Arabic
2. **Adaptive:** Full dark mode support with dynamic colors
3. **Customizable:** User can change accent color and font size
4. **Clean:** Generous whitespace, rounded corners, subtle shadows
5. **News-focused:** Breaking news prominent, featured carousel, category filtering
