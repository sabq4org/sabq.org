---
name: categories
type: api
description: List Sabq content categories (sections) with their slugs and URLs.
endpoint: /api/v1/categories
---

# Categories Skill

List all visible content categories.

## Endpoint

`GET /api/v1/categories`

## Response

`application/json` matching `CategoryList` schema in `/openapi.json`. Each item includes `id`, `name_ar`, `name_en`, `slug`, `description`, and a public `url`.

## Opening a category page

Use the returned `url` (e.g. `https://sabq.org/category/{slug}`) to open a category in a browser. Agents using WebMCP can call the `open_category` tool exposed on the homepage.
