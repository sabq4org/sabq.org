# تصميم منصة "سبق الذكية" - Design Guidelines

## Design Approach

**Reference-Based Approach** drawing inspiration from:
- **Arabic News Platforms**: Al Jazeera, Al Arabiya (modern Arabic news aesthetics)
- **International News**: Medium, The Guardian (clean typography, content focus)
- **Dashboard Design**: Notion, Linear (for CMS interface)

**Core Principles:**
- RTL-first design with Arabic language optimization
- Content readability as primary focus
- Professional credibility through clean, structured layouts
- Subtle AI feature integration without overwhelming users

---

## Color Palette

### Light Mode
- **Primary Brand**: 210 90% 45% (Deep professional blue - trust and authority)
- **Secondary**: 210 80% 35% (Darker blue for hover states)
- **Accent**: 25 85% 55% (Warm orange for CTAs and highlights)
- **Background**: 0 0% 98% (Soft white for main areas)
- **Surface**: 0 0% 100% (Pure white for cards)
- **Text Primary**: 220 20% 15% (Near black for headlines)
- **Text Secondary**: 220 15% 40% (Gray for body text)

### Dark Mode
- **Primary Brand**: 210 80% 60% (Lighter blue for dark backgrounds)
- **Background**: 220 25% 8% (Deep navy background)
- **Surface**: 220 20% 12% (Elevated cards)
- **Text Primary**: 0 0% 95% (Near white)
- **Text Secondary**: 220 10% 70% (Light gray)

### Semantic Colors
- **Success**: 150 70% 45% (Green for published status)
- **Warning**: 40 90% 55% (Amber for pending review)
- **Error**: 0 75% 50% (Red for urgent/breaking news)
- **Info**: 200 80% 50% (Blue for notifications)

---

## Typography

**Arabic Primary Font**: 'Tajawal', sans-serif (Google Fonts - clean, modern Arabic)
**English/Numbers**: 'Inter', sans-serif (Google Fonts - excellent readability)

### Scale & Hierarchy
- **Display (Breaking News)**: text-5xl md:text-6xl font-bold (48-60px)
- **H1 (Article Headlines)**: text-3xl md:text-4xl font-bold (30-36px)
- **H2 (Section Headers)**: text-2xl md:text-3xl font-semibold (24-30px)
- **H3 (Category Titles)**: text-xl font-semibold (20px)
- **Body Large (Article Lead)**: text-lg leading-relaxed (18px)
- **Body Regular (Content)**: text-base leading-loose (16px)
- **Caption (Timestamps, Meta)**: text-sm text-secondary (14px)

**RTL Considerations**: 
- Slightly increased line-height for Arabic (leading-loose vs leading-relaxed)
- Right-aligned text throughout
- Flipped directional utilities (mr → ml, etc.)

---

## Layout System

**Spacing Scale**: Tailwind units 2, 4, 6, 8, 12, 16, 20, 24
- Consistent rhythm: p-6 for cards, gap-4 for grids, mb-8 for section spacing

### Container Hierarchy
```
- Max width: max-w-7xl (main content)
- Reading width: max-w-4xl (article bodies)
- Dashboard: max-w-full with px-6
```

### Grid Systems
- **News Grid**: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
- **Featured Layout**: 2/3 + 1/3 split on desktop
- **Dashboard**: Sidebar (256px fixed) + main content (flex-1)

---

## Component Library

### Navigation
**Main Header (Public)**
- Fixed top navigation with backdrop-blur-lg
- Logo (right side for RTL), search bar (center), auth buttons (left)
- Category pills below header (horizontal scroll on mobile)
- Subtle shadow: shadow-sm

**Dashboard Sidebar (CMS)**
- Right-aligned (RTL), w-64, bg-surface
- Collapsible on mobile
- Icon + text navigation items
- Role-based menu visibility

### Cards & Content

**News Card (Grid View)**
- Aspect ratio 16:9 image
- Gradient overlay on image for text readability
- Category badge (top-right of image)
- Title + meta (date, author) + excerpt
- Hover: subtle scale transform-gpu scale-105 transition

**Featured Article Card**
- Large hero image (2/3 width on desktop)
- Prominent headline overlaying image bottom
- AI summary badge (if available)
- Call-to-action: "قراءة المزيد" button

**Article Page Layout**
- Hero image with gradient overlay
- Breadcrumbs navigation
- Article header: category, title, author card, date
- Body: max-w-prose, generous spacing
- Related articles sidebar (1/4 width)
- Fixed floating share bar (social + bookmark)

### Forms & Inputs

**CMS Article Editor**
- Rich text editor (Tiptap-like)
- Arabic-optimized toolbar (RTL icons)
- Image upload dropzone with preview
- AI assistance panel (floating right side):
  - "توليد عنوان" (Generate title)
  - "تلخيص تلقائي" (Auto summarize)
- Draft/Publish toggle with status indicator

**Comment System**
- Nested threading (2 levels max)
- User avatar + name + timestamp
- Like/Reply actions (subtle hover states)
- Moderation tools for admins (hidden dropdown)

### AI Features Integration

**Subtle Indicators**
- Small AI sparkle icon ✨ next to AI-generated content
- Tooltip on hover: "محتوى مُنشأ بالذكاء الاصطناعي"
- Pastel purple highlight for AI suggestions

**Recommendations Widget**
- "مقترحات لك" section
- Horizontal scrollable cards on mobile
- 3-column grid on desktop
- Reasoning text: "بناءً على قراءاتك السابقة"

### Data Display

**Dashboard Analytics**
- Card-based metrics (views, likes, shares)
- Simple bar/line charts (Chart.js)
- Color-coded status tags
- Export button (top-right of tables)

---

## Images

### Hero Images
- **Homepage**: Large breaking news hero (60vh) with gradient overlay
- **Article Pages**: Featured image (40vh) with title overlay
- **CMS Dashboard**: No hero - utility focused
- **Category Pages**: Medium banner (30vh) with category name

### Content Images
- **News Card Thumbnails**: Aspect ratio 16:9, lazy loaded
- **Author Avatars**: Circular, 40px diameter
- **Category Icons**: 24px SVG icons from Heroicons
- **Article Inline**: Full width with caption below

**Image Treatment**:
- Subtle border-radius (rounded-lg)
- Loading skeleton: animate-pulse bg-gray-200
- Responsive sizing: object-cover

---

## Accessibility & RTL

### RTL Implementation
- `dir="rtl"` on html tag
- Flip all directional utilities automatically
- Arabic number formatting (٠١٢٣٤٥٦٧٨٩)
- Right-to-left reading order for grids

### Accessibility
- High contrast ratios (WCAG AAA where possible)
- Focus indicators: ring-2 ring-primary ring-offset-2
- Skip to content link
- ARIA labels in Arabic
- Keyboard navigation for all interactions

---

## Interactions & Animations

**Minimal, Purpose-Driven Animations**:
- Page transitions: fade-in (200ms)
- Card hover: subtle lift (transform: translateY(-2px))
- Button states: built-in Tailwind transitions
- Loading states: spinner or skeleton screens
- Scroll reveal: fade-in-up for content sections (observer-based)

**No Distracting Effects**: Avoid parallax, excessive motion, or decorative animations

---

## Page-Specific Guidelines

### Homepage
- Breaking news hero (full-width)
- Trending topics bar (horizontal pills)
- Latest news grid (3 columns)
- Category sections (e.g., "رياضة", "تقنية", "اقتصاد")
- Newsletter signup (subtle bottom section)

### Dashboard (CMS)
- Metrics overview cards (top row)
- Recent articles table
- Quick actions (floating action button)
- Activity feed (right sidebar)

### Article Detail
- Structured content: headline → lead → body → related
- Persistent social share bar
- Comment section (below article)
- Recommendation carousel (bottom)

This design system creates a **professional, credible Arabic news platform** with seamless AI integration and role-based interfaces optimized for both content consumption and creation.