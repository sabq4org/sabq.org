# Sabq English Mobile App - API Documentation

**Version:** 1.0.0  
**Base URL:** `https://sabq.org/api/v1/en`  
**Language:** English (LTR)

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication APIs](#authentication-apis)
3. [News Feed APIs](#news-feed-apis)
4. [Categories & Menu](#categories--menu)
5. [Article Details](#article-details)
6. [Member Profile](#member-profile)
7. [Interests & Personalization](#interests--personalization)
8. [Bookmarks & Reading History](#bookmarks--reading-history)
9. [Push Notifications (FCM)](#push-notifications-fcm)
10. [Error Codes](#error-codes)

---

## Overview

The Sabq English Mobile App API provides a complete set of endpoints for the English version of the Sabq news app. The app supports:

- **Language Toggle:** Users can switch between Arabic and English
- **Independent Content:** English articles from `en_articles` table
- **Shared Authentication:** Same user accounts work for both languages
- **FCM Push Notifications:** Supports English notification content

### Request Headers

```
Content-Type: application/json
Accept: application/json
Authorization: Bearer <session_token>  // For authenticated endpoints
Accept-Language: en
```

### Response Format

All responses follow this structure:

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

Error responses:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

---

## Authentication APIs

Authentication uses the unified `users` table. Same accounts work for Arabic and English versions.

### 1. Register New Account

**POST** `/api/v1/en/auth/register`

Creates a new reader account and sends email activation code.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+966501234567"  // Optional
}
```

**Success Response (201):**

```json
{
  "success": true,
  "message": "Registration successful. Please check your email for the activation code.",
  "data": {
    "userId": "uuid-string",
    "email": "user@example.com",
    "requiresActivation": true
  }
}
```

**Error Responses:**

| Status | Code | Message |
|--------|------|---------|
| 400 | INVALID_EMAIL | Invalid email format |
| 400 | WEAK_PASSWORD | Password must be at least 8 characters |
| 409 | EMAIL_EXISTS | An account with this email already exists |

---

### 2. Activate Account

**POST** `/api/v1/en/auth/activate`

Verifies the 6-digit activation code sent via email.

**Request Body:**

```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Account activated successfully",
  "data": {
    "token": "session-token-uuid",
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "reader",
      "locale": "en"
    }
  }
}
```

**Error Responses:**

| Status | Code | Message |
|--------|------|---------|
| 400 | INVALID_CODE | Invalid or expired activation code |
| 404 | USER_NOT_FOUND | No account found with this email |

---

### 3. Resend Activation Code

**POST** `/api/v1/en/auth/resend-activation`

Resends the activation code to the user's email.

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Activation code sent to your email"
}
```

---

### 4. Login

**POST** `/api/v1/en/auth/login`

Authenticates a user and returns a session token.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "deviceInfo": {
    "platform": "ios",       // "ios" or "android"
    "deviceModel": "iPhone 15 Pro",
    "osVersion": "17.2",
    "appVersion": "1.0.0"
  }
}
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "token": "session-token-uuid",
    "expiresAt": "2026-02-19T12:00:00Z",
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "profileImage": "https://...",
      "role": "reader",
      "locale": "en",
      "interests": ["world", "technology", "business"]
    }
  }
}
```

**Error Responses:**

| Status | Code | Message |
|--------|------|---------|
| 401 | INVALID_CREDENTIALS | Invalid email or password |
| 403 | ACCOUNT_NOT_ACTIVATED | Please activate your account first |
| 403 | ACCOUNT_SUSPENDED | Your account has been suspended |

---

### 5. Logout

**POST** `/api/v1/en/auth/logout`

Invalidates the current session token.

**Headers Required:** `Authorization: Bearer <token>`

**Success Response (200):**

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### 6. Logout All Devices

**POST** `/api/v1/en/auth/logout-all`

Invalidates all session tokens for the user.

**Headers Required:** `Authorization: Bearer <token>`

**Success Response (200):**

```json
{
  "success": true,
  "message": "Logged out from all devices"
}
```

---

### 7. Forgot Password

**POST** `/api/v1/en/auth/forgot-password`

Sends a password reset code to the user's email.

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Password reset code sent to your email"
}
```

---

### 8. Reset Password

**POST** `/api/v1/en/auth/reset-password`

Resets the password using the code sent via email.

**Request Body:**

```json
{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "NewSecurePass123!"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Password reset successful. You can now login with your new password."
}
```

---

## News Feed APIs

### 1. Homepage Data (Lite)

**GET** `/api/v1/en/homepage-lite`

Returns optimized homepage data for fast initial load.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "hero": [
      {
        "id": "article-uuid",
        "title": "Breaking: Major Economic Summit Announced",
        "excerpt": "World leaders gather...",
        "imageUrl": "https://...",
        "thumbnailUrl": "https://...",
        "category": {
          "id": "cat-uuid",
          "name": "World",
          "slug": "world",
          "color": "#1a73e8"
        },
        "publishedAt": "2026-01-19T08:00:00Z",
        "newsType": "breaking",
        "views": 15420
      }
    ],
    "featured": [...],
    "latestNews": [...],
    "breakingNews": {...}
  }
}
```

---

### 2. Latest Articles

**GET** `/api/v1/en/articles/latest`

Returns paginated list of latest published articles.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| limit | int | 20 | Articles per page (max 50) |
| category | string | null | Filter by category slug |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "articles": [
      {
        "id": "article-uuid",
        "title": "Technology Giants Report Strong Earnings",
        "excerpt": "Major tech companies exceeded...",
        "imageUrl": "https://...",
        "thumbnailUrl": "https://...",
        "category": {
          "id": "cat-uuid",
          "name": "Technology",
          "slug": "technology"
        },
        "author": {
          "id": "author-uuid",
          "name": "Sarah Johnson"
        },
        "publishedAt": "2026-01-19T10:30:00Z",
        "views": 8750,
        "commentsCount": 42
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1250,
      "totalPages": 63,
      "hasMore": true
    }
  }
}
```

---

### 3. Trending Articles

**GET** `/api/v1/en/articles/trending`

Returns trending articles based on views and engagement.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| period | string | "24h" | "6h", "24h", "7d", "30d" |
| limit | int | 10 | Number of articles (max 20) |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "articles": [...],
    "period": "24h"
  }
}
```

---

### 4. Articles by Category

**GET** `/api/v1/en/categories/:slug/articles`

Returns articles for a specific category.

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| slug | string | Category slug (e.g., "world", "technology") |

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| limit | int | 20 | Articles per page |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "category": {
      "id": "cat-uuid",
      "name": "World News",
      "slug": "world",
      "description": "Latest international news",
      "color": "#1a73e8",
      "heroImageUrl": "https://..."
    },
    "articles": [...],
    "pagination": {...}
  }
}
```

---

### 5. Search Articles

**GET** `/api/v1/en/articles/search`

Full-text search across English articles.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| q | string | Yes | Search query |
| page | int | No | Page number (default: 1) |
| limit | int | No | Results per page (default: 20) |
| category | string | No | Filter by category slug |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "query": "technology",
    "articles": [...],
    "pagination": {...}
  }
}
```

---

## Article Details

### 1. Get Article

**GET** `/api/v1/en/articles/:id`

Returns full article details.

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| id | string | Article UUID or slug |

**Headers:** `Authorization: Bearer <token>` (optional, for personalized data)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "article": {
      "id": "article-uuid",
      "title": "Full Article Title Here",
      "subtitle": "Optional subtitle",
      "content": "<p>Full HTML content...</p>",
      "excerpt": "Brief summary...",
      "imageUrl": "https://...",
      "thumbnailUrl": "https://...",
      "category": {
        "id": "cat-uuid",
        "name": "Technology",
        "slug": "technology",
        "color": "#1a73e8"
      },
      "author": {
        "id": "author-uuid",
        "name": "Sarah Johnson",
        "profileImage": "https://...",
        "bio": "Senior Technology Editor"
      },
      "articleType": "news",
      "newsType": "featured",
      "aiSummary": "AI-generated summary...",
      "views": 15420,
      "publishedAt": "2026-01-19T08:00:00Z",
      "updatedAt": "2026-01-19T10:00:00Z"
    },
    "engagement": {
      "commentsCount": 42,
      "reactionsCount": 156,
      "isBookmarked": false,
      "hasReacted": false
    },
    "relatedArticles": [...]
  }
}
```

---

### 2. Track Article View

**POST** `/api/v1/en/articles/:id/view`

Tracks article view for analytics.

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| id | string | Article UUID |

**Request Body (optional):**

```json
{
  "referrer": "homepage",
  "sessionId": "session-uuid"
}
```

**Response (200):**

```json
{
  "success": true,
  "views": 15421
}
```

---

### 3. Get Article Comments

**GET** `/api/v1/en/articles/:id/comments`

Returns approved comments for an article.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| limit | int | 20 | Comments per page |
| sort | string | "newest" | "newest" or "popular" |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "comments": [
      {
        "id": "comment-uuid",
        "content": "Great article!",
        "user": {
          "id": "user-uuid",
          "name": "John Doe",
          "profileImage": "https://..."
        },
        "createdAt": "2026-01-19T09:30:00Z",
        "replies": [...]
      }
    ],
    "pagination": {...}
  }
}
```

---

### 4. Add Comment

**POST** `/api/v1/en/articles/:id/comments`

Adds a new comment (requires authentication).

**Headers Required:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "content": "This is a great article!",
  "parentId": null  // For replies, provide parent comment ID
}
```

**Response (201):**

```json
{
  "success": true,
  "message": "Comment submitted for review",
  "data": {
    "id": "comment-uuid",
    "status": "pending"
  }
}
```

---

### 5. React to Article

**POST** `/api/v1/en/articles/:id/react`

Adds or removes a reaction.

**Headers Required:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "type": "like"  // "like", "love", "wow", "sad", "angry"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "reacted": true,
    "type": "like",
    "totalReactions": 157
  }
}
```

---

### 6. Bookmark Article

**POST** `/api/v1/en/articles/:id/bookmark`

Adds or removes article from bookmarks.

**Headers Required:** `Authorization: Bearer <token>`

**Response (200):**

```json
{
  "success": true,
  "data": {
    "bookmarked": true
  }
}
```

---

## Categories & Menu

### 1. Get All Categories

**GET** `/api/v1/en/categories`

Returns all active English categories.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "id": "cat-uuid",
        "name": "Saudi Arabia",
        "slug": "saudi-arabia",
        "description": "Latest news from Saudi Arabia",
        "color": "#1a73e8",
        "icon": "saudi-flag",
        "displayOrder": 1
      },
      {
        "id": "cat-uuid-2",
        "name": "World",
        "slug": "world",
        "description": "International news",
        "color": "#4caf50",
        "displayOrder": 2
      }
    ]
  }
}
```

---

### 2. Get Menu Groups

**GET** `/api/v1/en/menu-groups`

Returns organized menu structure for navigation.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "groups": [
      {
        "title": "Main Sections",
        "items": [
          { "id": "cat-uuid", "name": "Saudi Arabia", "slug": "saudi-arabia", "icon": "flag" },
          { "id": "cat-uuid", "name": "World", "slug": "world", "icon": "globe" },
          { "id": "cat-uuid", "name": "Sports", "slug": "sports", "icon": "trophy" }
        ]
      },
      {
        "title": "Featured",
        "items": [
          { "id": "cat-uuid", "name": "Technology", "slug": "technology", "icon": "cpu" },
          { "id": "cat-uuid", "name": "Business", "slug": "business", "icon": "trending-up" }
        ]
      }
    ]
  }
}
```

---

## Member Profile

### 1. Get Profile

**GET** `/api/v1/en/members/profile`

Returns the authenticated user's profile.

**Headers Required:** `Authorization: Bearer <token>`

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+966501234567",
    "profileImage": "https://...",
    "locale": "en",
    "city": "Riyadh",
    "country": "Saudi Arabia",
    "gender": "male",
    "birthDate": "1990-05-15",
    "interests": ["technology", "business", "world"],
    "memberSince": "2025-06-01T00:00:00Z",
    "stats": {
      "articlesRead": 342,
      "bookmarksCount": 28,
      "commentsCount": 15
    }
  }
}
```

---

### 2. Update Profile

**PUT** `/api/v1/en/members/profile`

Updates the user's profile information.

**Headers Required:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+966501234567",
  "city": "Riyadh",
  "country": "Saudi Arabia",
  "gender": "male",
  "birthDate": "1990-05-15",
  "locale": "en"
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": { ... }
}
```

---

### 3. Upload Profile Image

**POST** `/api/v1/en/members/profile/image`

Uploads a new profile image.

**Headers Required:** `Authorization: Bearer <token>`

**Content-Type:** `multipart/form-data`

**Form Fields:**

| Field | Type | Description |
|-------|------|-------------|
| image | file | JPEG/PNG image (max 5MB) |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "profileImage": "https://storage.googleapis.com/.../profile-uuid.jpg"
  }
}
```

---

### 4. Delete Profile Image

**DELETE** `/api/v1/en/members/profile/image`

Removes the user's profile image.

**Headers Required:** `Authorization: Bearer <token>`

**Response (200):**

```json
{
  "success": true,
  "message": "Profile image removed"
}
```

---

### 5. Change Password

**POST** `/api/v1/en/members/change-password`

Changes the user's password.

**Headers Required:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewSecurePass456!"
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

### 6. Delete Account

**POST** `/api/v1/en/members/account`

Permanently deletes the user's account.

**Headers Required:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "password": "CurrentPass123!",
  "reason": "Optional reason for leaving"
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Account deleted successfully"
}
```

---

## Interests & Personalization

### 1. Get Available Interests

**GET** `/api/v1/en/interests`

Returns all available interests/topics for personalization.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "interests": [
      { "id": "int-uuid", "name": "Technology", "slug": "technology", "icon": "cpu" },
      { "id": "int-uuid", "name": "Sports", "slug": "sports", "icon": "trophy" },
      { "id": "int-uuid", "name": "Business", "slug": "business", "icon": "trending-up" },
      { "id": "int-uuid", "name": "Entertainment", "slug": "entertainment", "icon": "film" }
    ]
  }
}
```

---

### 2. Get User Interests

**GET** `/api/v1/en/members/interests`

Returns the user's selected interests.

**Headers Required:** `Authorization: Bearer <token>`

**Response (200):**

```json
{
  "success": true,
  "data": {
    "interests": [
      { "id": "int-uuid", "name": "Technology", "slug": "technology" },
      { "id": "int-uuid", "name": "Business", "slug": "business" }
    ]
  }
}
```

---

### 3. Update User Interests

**PUT** `/api/v1/en/members/interests`

Replaces all user interests with the provided list.

**Headers Required:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "categoryIds": ["cat-uuid-1", "cat-uuid-2", "cat-uuid-3"]
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Interests updated successfully"
}
```

---

### 4. Add Interest

**POST** `/api/v1/en/members/interests/add`

Adds a single interest.

**Headers Required:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "categoryId": "cat-uuid"
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Interest added"
}
```

---

### 5. Remove Interest

**DELETE** `/api/v1/en/members/interests/:categoryId`

Removes a single interest.

**Headers Required:** `Authorization: Bearer <token>`

**Response (200):**

```json
{
  "success": true,
  "message": "Interest removed"
}
```

---

## Bookmarks & Reading History

### 1. Get Bookmarks

**GET** `/api/v1/en/members/bookmarks`

Returns user's bookmarked articles.

**Headers Required:** `Authorization: Bearer <token>`

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| limit | int | 20 | Items per page |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "bookmarks": [
      {
        "id": "bookmark-uuid",
        "article": {
          "id": "article-uuid",
          "title": "Article Title",
          "thumbnailUrl": "https://...",
          "category": { "name": "Technology", "slug": "technology" },
          "publishedAt": "2026-01-19T08:00:00Z"
        },
        "createdAt": "2026-01-19T10:00:00Z"
      }
    ],
    "pagination": {...}
  }
}
```

---

### 2. Get Reading History

**GET** `/api/v1/en/members/reading-history`

Returns user's reading history.

**Headers Required:** `Authorization: Bearer <token>`

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| limit | int | 20 | Items per page |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "history": [
      {
        "article": {
          "id": "article-uuid",
          "title": "Article Title",
          "thumbnailUrl": "https://...",
          "category": { "name": "Technology" }
        },
        "readAt": "2026-01-19T09:30:00Z",
        "readDuration": 180
      }
    ],
    "pagination": {...}
  }
}
```

---

### 3. Clear Reading History

**DELETE** `/api/v1/en/members/reading-history`

Clears user's reading history.

**Headers Required:** `Authorization: Bearer <token>`

**Response (200):**

```json
{
  "success": true,
  "message": "Reading history cleared"
}
```

---

## Push Notifications (FCM)

### 1. Register FCM Token

**POST** `/api/v1/en/members/fcm-token`

Registers or updates the device's FCM token.

**Headers Required:** `Authorization: Bearer <token>`

**Request Body:**

```json
{
  "fcmToken": "firebase-cloud-messaging-token-string",
  "platform": "ios",
  "deviceInfo": {
    "deviceModel": "iPhone 15 Pro",
    "osVersion": "17.2",
    "appVersion": "1.0.0"
  }
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "FCM token registered"
}
```

---

### 2. Register Device (Anonymous)

**POST** `/api/v1/en/devices/register`

Registers a device for push notifications without requiring login.

**Request Body:**

```json
{
  "deviceToken": "fcm-token-string",
  "platform": "android",
  "locale": "en",
  "topics": ["breaking_news", "sports"]
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "deviceId": "device-uuid"
  }
}
```

---

### 3. Unregister Device

**DELETE** `/api/v1/en/devices/unregister`

Removes device from push notifications.

**Request Body:**

```json
{
  "deviceToken": "fcm-token-string"
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Device unregistered"
}
```

---

### 4. Get Notification Topics

**GET** `/api/v1/en/topics`

Returns available notification topics.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "topics": [
      { "id": "breaking_news", "name": "Breaking News", "description": "Urgent news alerts" },
      { "id": "sports", "name": "Sports", "description": "Sports updates and scores" },
      { "id": "technology", "name": "Technology", "description": "Tech news and updates" }
    ]
  }
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| UNAUTHORIZED | 401 | Authentication required or token expired |
| FORBIDDEN | 403 | Access denied (account suspended, etc.) |
| NOT_FOUND | 404 | Resource not found |
| VALIDATION_ERROR | 400 | Invalid request data |
| RATE_LIMITED | 429 | Too many requests |
| SERVER_ERROR | 500 | Internal server error |
| EMAIL_EXISTS | 409 | Email already registered |
| INVALID_CREDENTIALS | 401 | Wrong email or password |
| ACCOUNT_NOT_ACTIVATED | 403 | Account needs activation |
| ACCOUNT_SUSPENDED | 403 | Account is suspended |
| INVALID_CODE | 400 | Wrong or expired code |
| WEAK_PASSWORD | 400 | Password doesn't meet requirements |

---

## Database Schema (English Tables)

```
en_categories
├── id (UUID, PK)
├── name (text)
├── slug (text, unique)
├── description (text)
├── color (text)
├── icon (text)
├── hero_image_url (text)
├── display_order (int)
├── status (text: active/inactive)
├── type (text: core/dynamic/smart/seasonal)
├── created_at (timestamp)
└── updated_at (timestamp)

en_articles
├── id (UUID, PK)
├── title (text)
├── subtitle (text)
├── slug (text, unique)
├── content (text)
├── excerpt (text)
├── image_url (text)
├── category_id (FK → en_categories)
├── author_id (FK → users)
├── article_type (text: news/opinion/analysis/column/infographic)
├── news_type (text: breaking/featured/regular)
├── status (text: draft/scheduled/published/archived)
├── ai_summary (text)
├── views (int)
├── published_at (timestamp)
├── created_at (timestamp)
└── updated_at (timestamp)

en_comments
├── id (UUID, PK)
├── article_id (FK → en_articles)
├── user_id (FK → users)
├── content (text)
├── status (text: pending/approved/rejected/flagged)
├── parent_id (UUID, self-reference)
├── moderated_by (FK → users)
├── moderated_at (timestamp)
└── created_at (timestamp)

en_reactions
├── id (UUID, PK)
├── article_id (FK → en_articles)
├── user_id (FK → users)
├── type (text: like/love/wow/sad/angry)
└── created_at (timestamp)

en_bookmarks
├── id (UUID, PK)
├── article_id (FK → en_articles)
├── user_id (FK → users)
└── created_at (timestamp)

en_reading_history
├── id (UUID, PK)
├── user_id (FK → users)
├── article_id (FK → en_articles)
├── read_at (timestamp)
└── read_duration (int, seconds)

en_smart_blocks (Homepage Blocks)
├── id (UUID, PK)
├── block_type (text)
├── title (text)
├── display_order (int)
├── is_active (boolean)
├── config (jsonb)
├── created_at (timestamp)
└── updated_at (timestamp)
```

---

## Implementation Notes

1. **Language Detection:** App sends `Accept-Language: en` header
2. **Shared Auth:** Uses same `users` table, `locale` field tracks preference
3. **Email Templates:** Need English versions for activation/reset emails
4. **FCM Topics:** Use `en_` prefix for English topics (e.g., `en_breaking_news`)
5. **Cache Keys:** Prefix with `en:` for English content caching

---

**Last Updated:** January 19, 2026
