---
name: article-fetch
type: api
description: Fetch a single Sabq article in JSON or as Markdown using content negotiation.
endpoint: /api/v1/articles/{id}
---

# Article Fetch Skill

Fetch a single Sabq article either by ID via the JSON API, or by slug via Markdown content negotiation on the public URL.

## JSON

`GET /api/v1/articles/{id}` — returns the `Article` schema from `/openapi.json`.

## Markdown

For human-readable URLs, send `Accept: text/markdown` to the article page:

```
GET /article/{slug}
Accept: text/markdown
```

Response: `Content-Type: text/markdown; charset=utf-8` containing the article title, metadata, and body converted to Markdown.

## Notes

- The same Markdown negotiation works for the homepage `/` and category pages `/category/{slug}`.
- Attribution is required per the policy at `/.well-known/ai-usage.json`.
