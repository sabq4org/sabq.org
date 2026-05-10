---
name: latest-news
type: api
description: Fetch the latest published news articles from Sabq, optionally filtered by breaking/featured type.
endpoint: /api/v1/articles
---

# Latest News Skill

Retrieve the most recent published articles from Sabq.

## Endpoint

`GET /api/v1/articles?limit={limit}&offset={offset}&newsType={breaking|featured|regular}&since={iso8601}`

For breaking news only: `GET /api/v1/breaking?limit={limit}`.

## Response

`application/json` matching `ArticleList` / `BreakingNews` schemas in `/openapi.json`.
