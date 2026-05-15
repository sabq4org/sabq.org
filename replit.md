# Sabq Smart News Platform

Sabq Smart is an AI-powered, trilingual news platform that redefines news consumption through AI summarization, personalization, and social media distribution.

## Run & Operate

*   **Install Dependencies**: `npm install`
*   **Run Development Server**: `npm run dev`
*   **Build**: `npm run build`
*   **Typecheck**: `npm run typecheck`
*   **Generate Drizzle Kit Migrations**: `npm run db:generate`
*   **Push Drizzle Kit Migrations to DB**: `npm run db:push`
*   **Environment Variables**: `DATABASE_URL`, `REDIS_URL` (optional), `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `SENDGRID_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, `GCS_PROJECT_ID`, `GCS_KEYFILE_PATH`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_IMAGES_TOKEN`, `CLOUDFLARE_ACCOUNT_HASH` (the three Cloudflare Images vars — checked by `isCloudflareConfigured()`), `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN` (for cache purge), `FCM_SERVER_KEY`, `MAILERLITE_WEBHOOK_SECRET` (required — MailerLite webhook signing secret for HMAC-SHA256 verification)

## Stack

*   **Frontend**: Next.js 15, React 18, Vite, Wouter, TypeScript, TanStack Query
*   **Backend**: Express.js, TypeScript
*   **Database**: PostgreSQL (Neon serverless)
*   **ORM**: Drizzle ORM
*   **Authentication**: Passport.js
*   **Validation**: _Populate as you build_
*   **Build Tool**: Vite

## Where things live

*   `/client`: Frontend Next.js application
*   `/server`: Backend Express.js application and API routes
*   `/shared`: Shared types, utilities, and Drizzle schema
*   `server/db/schema.ts`: Database schema definition (source of truth)
*   `server/routes`: API endpoints
*   `client/src/styles`: Global styles and theme definitions
*   `server/seoInjector.ts`: Centralized SEO logic
*   `server/memoryCache.ts`: In-memory caching configuration
*   `server/selectHelpers.ts`: Database select query optimizations

## Architecture decisions

*   **Trilingual & RTL-first Design**: Comprehensive support for Arabic, English, and Urdu, with RTL layout optimization and independent content management per language.
*   **Hybrid Content Ordering**: Articles are displayed using a combination of curated sections and chronological feeds.
*   **Server-Side Rendered (SSR) SPA with CDN Caching**: Uses Next.js for SSR and aggressively caches all SPA routes via Cloudflare CDN to reduce server load and improve performance.
*   **"Null" for Missing Data**: TanStack Query expects `null` (not `undefined`) for non-existent data to avoid issues with array destructuring defaults, leading to explicit `Array.isArray(dataRaw) ? dataRaw : []` guards.
*   **Optimized Database Selects**: All article and user list queries use narrowed `select` statements to retrieve only necessary columns, significantly reducing DB load and improving data transfer efficiency.
*   **Lazy CSRF**: CSRF tokens are only fetched on-demand for state-changing requests by authenticated users to minimize unnecessary Redis sessions and requests for anonymous users.

## Product

*   **AI-Powered News Platform**: Offers AI summarization, personalized recommendations, AI content generation (including multilingual SEO and translation), and deep analysis.
*   **Comprehensive Content Management**: Features a full lifecycle CMS for articles, news, users, and categories, with an advanced WYSIWYG editor and Smart Media Library.
*   **Real-time Features**: "Moment by Moment" Live News Desk, breaking news ticker, and an advanced Smart Notification System.
*   **Advanced SEO & Social Media Integration**: Enterprise-grade viral distribution with click tracking, social crawler middleware, dynamic metadata, and comprehensive technical SEO.
*   **Specialized Systems**: Includes iFox Content Generator, Audio Newsletter System, Intelligent Email Agent System, WhatsApp Auto-Publish, and Publisher/Agency Content Sales.
*   **Advanced AI & Security**: AI Comment Moderation (GPT-4o-mini), Advanced Search with Arabic text normalization, and Full Role-Based Access Control (RBAC).

## User preferences

Preferred communication style: Simple, everyday language.

## Gotchas

*   **Cache TTLs**: Do not redeclare `CACHE_TTL` as a local variable; it will shadow the imported object and break SWR caching.
*   **Null/Undefined Safety**: All TanStack Query data MUST be guarded with `Array.isArray(dataRaw) ? dataRaw : []` after the `useQuery()` call.
*   **`slugRedirectMiddleware`**: This middleware 301-redirects Arabic slugs and `/news/` paths to `/article/{englishSlug}` for ALL visitors, including crawlers.
*   **Cloudflare Image Transform**: Ensure relative image paths are routed through Cloudflare Image Transform for optimized social media images. Avoid using CF Image Transform on `/public-objects/` and `/api/` paths directly, as they return HTML.
*   **Production `/public-objects/` paths**: In Replit production, `/public-objects/` paths need server-side 302 redirects to `/api/public-media/public/*` to serve actual images instead of SPA fallback HTML.

## Pointers

*   **Drizzle ORM Documentation**: [https://orm.drizzle.team/docs/overview](https://orm.drizzle.team/docs/overview)
*   **TanStack Query Documentation**: [https://tanstack.com/query/latest/docs/react/overview](https://tanstack.com/query/latest/docs/react/overview)
*   **Next.js Documentation**: [https://nextjs.org/docs](https://nextjs.org/docs)
*   **OpenAI API Documentation**: [https://platform.openai.com/docs/overview](https://platform.openai.com/docs/overview)
*   **Cloudflare Images Documentation**: [https://developers.cloudflare.com/images/](https://developers.cloudflare.com/images/)