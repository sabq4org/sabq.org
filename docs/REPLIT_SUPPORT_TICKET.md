# Replit Support Ticket - Autoscale Webhook Routing Issue

## Subject
Autoscale Deployment: External POST requests to /api/* routes return HTML instead of JSON

---

## Environment
- **Platform:** Replit
- **Deployment Type:** Autoscale
- **Project:** Sabq Smart News Platform
- **Project URL:** https://replit.com/@username/sabq
- **Production URL:** https://sabq.replit.app
- **Custom Domain:** https://sabq.life

---

## Issue Description

We have an Express.js + React application deployed using Replit Autoscale. External POST requests to API endpoints (specifically `/api/*` routes) are returning HTML (the frontend page) instead of JSON responses from the Express backend.

### Expected Behavior
External POST requests to `/api/email-agent/webhook` should reach the Express backend and return JSON responses.

### Actual Behavior
External POST requests to `/api/email-agent/webhook` return the frontend HTML page with HTTP 200 status.

---

## Technical Details

### Working (Development Environment)
```bash
curl -X POST http://localhost:5000/api/email-agent/webhook-test \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

Response: ✅ {"success": true, "message": "Webhook endpoint is working!", ...}
Status: 200 OK
Content-Type: application/json
```

### Not Working (Production Environment)
```bash
curl -X POST https://sabq.replit.app/api/email-agent/webhook-test \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

Response: ❌ <!DOCTYPE html><html>... (entire frontend page)
Status: 200 OK
Content-Type: text/html
```

---

## Impact

**Critical Business Impact:**
- We use SendGrid Inbound Parse to receive news articles via email
- Webhooks from SendGrid cannot reach our Express API endpoints
- This blocks our automated article publishing system
- 10+ active reporters are affected

**What We've Confirmed:**
1. ✅ Code works perfectly on localhost
2. ✅ Routes are registered BEFORE Vite/static middleware (correct order)
3. ✅ SendGrid is configured correctly and sending requests
4. ✅ The issue only occurs in Autoscale production deployment
5. ✅ Same code, same configuration, different behavior in production

---

## Code Architecture

### Express Route Registration (server/index.ts)
```typescript
// 1. Register all API routes FIRST
const server = await registerRoutes(app);

// 2. Social crawler middleware
app.use(socialCrawlerMiddleware);

// 3. Error handler
app.use(errorHandler);

// 4. Frontend serving comes LAST
if (app.get("env") === "development") {
  await setupVite(app, server);
} else {
  serveStatic(app);  // Static files only serve at the end
}
```

### API Routes (server/routes.ts)
```typescript
app.post("/api/email-agent/webhook", emailAgentWebhookHandler);
app.post("/api/email-agent/webhook-test", testWebhookHandler);
// ... other routes
```

**This architecture works perfectly on localhost but fails in production.**

---

## What We've Tried

### ❌ Attempt 1: Added explicit API middleware
```typescript
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  next();
});
```
**Result:** No effect - the issue appears to be at a higher level than Express

### ❌ Attempt 2: Verified route registration order
**Result:** Routes are already registered in the correct order (before static serving)

### ❌ Attempt 3: Tested with `.repl.co` URLs
**Result:** DNS error - doesn't work with Autoscale

---

## Hypothesis

The Autoscale deployment routing configuration appears to be routing ALL external requests (including POST requests to `/api/*`) to the static file server, bypassing the Express application entirely.

This is likely a deployment-level routing configuration issue rather than an application code issue.

---

## Request

Could you please:

1. **Review the routing configuration** for Autoscale deployments
2. **Ensure external requests to `/api/*` routes** are forwarded to the Express backend application
3. **Provide guidance** on proper configuration for Express + Vite apps on Autoscale that need to receive webhooks

---

## Workaround Considered

We could switch to **Reserved VM Deployment**, which might resolve the routing issue, but we prefer to use Autoscale for cost efficiency and scalability.

---

## Additional Context

### Application Stack
- **Backend:** Express.js + TypeScript
- **Frontend:** React + Vite
- **Port:** 5000 (single server for API + frontend)
- **Database:** PostgreSQL (Neon serverless)
- **File Storage:** Google Cloud Storage

### Use Case
- **SendGrid Inbound Parse** sends webhook POST requests
- **Express API** processes emails and extracts attachments
- **Images uploaded to GCS** and articles auto-published
- **Works perfectly in development** but fails in production

### Timeline
- Issue affects production deployment
- Blocking automated article publishing for 10+ reporters
- Development environment works perfectly

---

## Supporting Documentation

All code and detailed technical analysis is available in the project:
- `server/routes/emailAgent.ts` - Webhook handler
- `server/index.ts` - Express configuration
- `server/vite.ts` - Vite middleware setup
- `docs/SENDGRID_IMAGES_PRODUCTION_ISSUE.md` - Detailed technical analysis

---

## Expected Resolution

We expect external POST requests to `/api/*` routes to reach the Express backend application instead of returning the frontend HTML page.

Thank you for your assistance!

---

**Date:** November 17, 2025  
**Priority:** High (Production Issue)  
**Status:** Awaiting Replit Support Response
