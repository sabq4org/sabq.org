---
name: news-search
type: api
description: Search Sabq news articles by keyword in Arabic or English.
endpoint: /api/v1/search
---

# News Search Skill

Search published news articles on Sabq by keyword.

## Endpoint

`GET /api/v1/search?q={query}&limit={limit}&category={categoryId}&since={iso8601}`

## Parameters

- `q` (required): The search query (Arabic or English).
- `limit` (optional, default 20, max 100): Number of results.
- `category` (optional): Restrict to a category ID.
- `since` (optional): ISO 8601 datetime to limit to recent articles.

## Response

`application/json` matching `SearchResults` schema in `/openapi.json`.

## Example

```
GET /api/v1/search?q=الرياض&limit=10
```
