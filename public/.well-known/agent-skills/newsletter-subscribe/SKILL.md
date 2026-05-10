---
name: newsletter-subscribe
type: webmcp
description: Subscribe a user email to the Sabq newsletter. Exposed to agents as a WebMCP tool on the homepage.
endpoint: navigator.modelContext (browser)
---

# Newsletter Subscribe Skill

When a Sabq page is loaded in an agent-enabled browser, the page calls `navigator.modelContext.provideContext()` and exposes a `subscribe_newsletter` tool. Agents can invoke that tool with `{ email: string }` to subscribe a user.

## Input schema

```json
{
  "type": "object",
  "properties": {
    "email": { "type": "string", "format": "email" }
  },
  "required": ["email"]
}
```

## Behavior

The tool POSTs to the newsletter subscription endpoint and returns a JSON status. Agents must collect explicit user consent before calling this tool.
