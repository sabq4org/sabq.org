# Sabq Data Migration Mapping (Quintype CMS → Sabq Platform)

## Overview
- **Source**: Quintype CMS JSON Lines format
- **Sample Size**: 2,856 records
- **Content Type**: Published news articles (stories)

## Source Data Structure (Quintype)

### Main Fields (68 total)
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Article unique identifier |
| `headline` | string | Article title (Arabic) |
| `subheadline` | string | Article subtitle |
| `slug` | string | URL slug |
| `published-at` | timestamp | Publication date (Unix ms) |
| `first-published-at` | timestamp | First publication date |
| `last-published-at` | timestamp | Last publish update |
| `updated-at` | timestamp | Last update time |
| `created-at` | timestamp | Creation time |
| `status` | string | Always "published" in sample |
| `story-template` | string | "text", "articles", "video" |
| `word-count` | number | Article word count |
| `read-time` | number | Estimated read time (minutes) |

### SEO Fields
| Field | Type | Description |
|-------|------|-------------|
| `seo.meta-title` | string | SEO title |
| `seo.meta-description` | string | SEO description |
| `canonical-url` | string | Canonical URL (if set) |

### Hero Image Fields
| Field | Type | Description |
|-------|------|-------------|
| `hero-image-s3-key` | string | S3 path: `sabq/...` |
| `hero-image-metadata.width` | number | Image width |
| `hero-image-metadata.height` | number | Image height |
| `hero-image-alt-text` | string | Alt text (often null) |
| `hero-image-caption` | string | Caption (often null) |
| `hero-image-attribution` | string | Attribution |

### Author/Owner Fields
| Field | Type | Description |
|-------|------|-------------|
| `author-id` | number | Author's Quintype ID |
| `author-name` | string | Author display name |
| `authors[]` | array | Full author objects |
| `owner-id` | number | Content owner ID |
| `owner-name` | string | Content owner name |
| `assignee-id` | number | Assigned editor ID |
| `assignee-name` | string | Assigned editor name |

### Sections (Categories)
| Section Slug | Arabic Name |
|--------------|-------------|
| `saudia` | محليات |
| `stations` | محطات |
| `mylife` | حياتنا |
| `technology` | تقنية |
| `business` | أعمال |
| `world` | العالم |
| `tourism` | سياحة |
| `articles` | مقالات |
| `regions` | مناطق |
| `culture` | ثقافة |
| `community` | مجتمع |
| `sports` | رياضة |
| `careers` | وظائف |
| `cars` | سيارات |

### Tags Structure
```json
{
  "id": 4383315,
  "name": "مستشفى الدكتور سليمان الحبيب",
  "meta-description": null,
  "tag-type": "Tag"
}
```

### Cards & Story Elements (Content)
Each article has `cards[]` array containing `story-elements[]`:

#### Element Types
| Type | Subtype | Description |
|------|---------|-------------|
| `text` | - | HTML text content |
| `text` | `also-read` | Related articles link |
| `image` | - | Inline image |
| `youtube-video` | - | YouTube embed |
| `jsembed` | `tweet` | Twitter/X embed |
| `jsembed` | `instagram` | Instagram embed |
| `jsembed` | `dailymotion-embed-script` | Dailymotion embed |
| `composite` | `image-gallery` | Image gallery |
| `file` | `attachment` | File attachment |
| `title` | - | Section title |

#### Text Element Structure
```json
{
  "type": "text",
  "text": "<p>HTML content...</p>",
  "id": "uuid",
  "family-id": "uuid"
}
```

#### Image Element Structure
```json
{
  "type": "image",
  "image-s3-key": "sabq/2025-11-19/.../file.jpg",
  "image-metadata": {
    "width": 1280,
    "height": 1600,
    "mime-type": "image/jpeg",
    "file-size": 241876,
    "file-name": "file.jpg"
  },
  "alt-text": "",
  "title": "",
  "image-attribution": "",
  "hyperlink": null
}
```

---

## Target Schema Mapping (Sabq Platform)

### Articles Table
| Source Field | Target Field | Transform |
|--------------|--------------|-----------|
| `id` | `id` | Use as-is (UUID) |
| `headline` | `title` | Direct |
| `subheadline` | `subtitle` | Direct |
| `slug` | `slug` | Ensure unique |
| `cards[].story-elements[type=text].text` | `content` | Combine all text elements |
| `seo.meta-description` | `excerpt` | Use or generate |
| `hero-image-s3-key` | `imageUrl` | Convert to proxy URL |
| `sections[0].id` | `categoryId` | Map section→category |
| `author-id` | `authorId` | Map to users table |
| `story-template` | `articleType` | Map: text→news, articles→opinion, video→news |
| `published-at` | `publishedAt` | Convert from Unix ms |
| `created-at` | `createdAt` | Convert from Unix ms |
| `updated-at` | `updatedAt` | Convert from Unix ms |
| `status` | `status` | Map: published→published |
| `word-count` | - | Recalculate |
| `read-time` | - | Recalculate |

### SEO Object
| Source | Target |
|--------|--------|
| `seo.meta-title` | `seo.metaTitle` |
| `seo.meta-description` | `seo.metaDescription` |
| `hero-image-alt-text` | `seo.imageAltText` |

### Categories Table
| Source Section | Target |
|----------------|--------|
| `id` | `id` |
| `name` | `nameAr` |
| `slug` | `slug` |
| `external-id` | Used for mapping |

### Image URLs
Source S3 keys need conversion:
- Pattern: `sabq/YYYY-MM-DD/random/filename.jpg`
- Target: Determine CDN/proxy URL or re-upload to object storage

---

## Import Strategy

### Phase 1: Categories
1. Create categories from unique sections
2. Map section IDs to new category IDs

### Phase 2: Authors
1. Create/map authors from unique author names
2. Use system user for unmapped authors

### Phase 3: Articles
1. Import in batches (100 per batch)
2. Transform content from cards to HTML
3. Map categories and authors
4. Handle image URLs

### Phase 4: Images
1. Option A: Keep original S3 URLs (needs CDN config)
2. Option B: Re-upload to Replit Object Storage
3. Generate thumbnails for lite view

---

## Content Transformation

### Combining Story Elements
```typescript
function combineContent(cards: Card[]): string {
  let html = '';
  for (const card of cards) {
    for (const element of card['story-elements']) {
      switch (element.type) {
        case 'text':
          html += element.text;
          break;
        case 'image':
          html += `<figure><img src="${getImageUrl(element['image-s3-key'])}" alt="${element['alt-text'] || ''}" /></figure>`;
          break;
        case 'youtube-video':
          html += `<div class="youtube-embed" data-url="${element.url}"></div>`;
          break;
        // ... handle other types
      }
    }
  }
  return html;
}
```

---

## Notes
- All timestamps are Unix milliseconds
- Most articles have only one section (primary category)
- Tags are well-structured and can be imported
- Image S3 keys follow consistent pattern
- Sample has 2,041 articles with tags (71%)
