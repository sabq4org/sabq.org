# Audio Newsletter System Documentation

## Overview

The Audio Newsletter System provides automated generation and publishing of audio newsletters with Text-to-Speech (TTS) capabilities using ElevenLabs. The system includes scheduling, public access, RSS feed support, and a homepage audio widget.

## Features

### 1. Newsletter Scheduler Service

Located in `server/services/newsletterScheduler.ts`, this service provides:

- **Cron-based scheduling** with timezone support (default: Asia/Riyadh)
- **Pre-configured schedules**:
  - Morning Briefing: Daily at 6:00 AM (top 5 articles from last 24h)
  - Evening Digest: Daily at 8:00 PM (top 5 articles from last 12h)  
  - Weekly Roundup: Sundays at 10:00 AM (top articles from past week)
  - Tech Update: Tuesdays & Thursdays at 3:00 PM
  - Business Report: Weekdays at 11:00 AM
  - Sports Highlights: Daily at 7:00 PM

### 2. Homepage Audio Widget

The `HomeAudioWidget` component (`client/src/components/HomeAudioWidget.tsx`) provides:

- **Floating audio player** with mini/expanded views
- **Latest newsletter display** with auto-fetch
- **Playlist support** for recent newsletters (last 5)
- **Persistent playback** across page navigation
- **LocalStorage integration** for progress saving
- **Auto-play consent** management

### 3. Public Newsletter Page

The public page (`client/src/pages/AudioNewslettersPublic.tsx`) includes:

- **No authentication required** for public access
- **Grid/List view toggle** for different layouts
- **Search functionality** with real-time filtering
- **Category filtering** with multi-select
- **Newsletter cards** with embedded play buttons
- **Responsive design** for mobile/tablet/desktop

### 4. RSS Feed for Podcasts

The RSS feed (`server/routes/rssFeedRoutes.ts`) supports:

- **iTunes podcast tags** for Apple Podcasts
- **Episode metadata** with descriptions and timestamps
- **Enclosure tags** for audio files
- **Category mappings** for podcast directories
- **Author/owner information**

### 5. API Endpoints

Public endpoints in `server/routes/audioNewsletterRoutes.ts`:

```typescript
// Public endpoints (no auth required)
GET /api/audio-newsletters/public        // Get published newsletters
GET /api/audio-newsletters/public/:id    // Get specific newsletter
GET /api/rss/podcast                     // RSS feed for podcasts
```

## Configuration

### Environment Variables

```bash
# Newsletter Scheduler
ENABLE_NEWSLETTER_SCHEDULER=true         # Enable automated scheduling
ENABLE_BACKGROUND_WORKERS=true          # Required for background jobs
NEWSLETTER_TIMEZONE=Asia/Riyadh         # Timezone for schedules

# ElevenLabs Configuration  
ELEVENLABS_API_KEY=your_api_key         # API key for TTS
ELEVENLABS_DEFAULT_VOICE_ID=voice_id    # Default voice for generation
```

### Starting the Scheduler

The scheduler automatically starts when:
1. `ENABLE_BACKGROUND_WORKERS=true`
2. `ENABLE_NEWSLETTER_SCHEDULER=true`
3. Server starts successfully

Check server logs for confirmation:
```
[Server] ✅ Newsletter scheduler started
[Server] Scheduled newsletters: [morning_briefing at 0 6 * * *, evening_digest at 0 20 * * *, ...]
```

## Usage

### Creating Scheduled Newsletters

1. **Via API**:
```javascript
POST /api/audio-newsletters
{
  "title": "Morning Tech Briefing",
  "templateType": "morning_briefing",
  "status": "scheduled",
  "scheduledFor": "2024-01-15T06:00:00Z",
  "metadata": {
    "recurringSchedule": {
      "enabled": true,
      "type": "daily",
      "time": "06:00",
      "timezone": "Asia/Riyadh"
    }
  }
}
```

2. **Via Dashboard**: Navigate to `/admin/audio-newsletters` and use the schedule creation form

### Homepage Integration

The audio widget is automatically integrated into the homepage. To customize:

```jsx
// In client/src/pages/Home.tsx
<HomeAudioWidget 
  position="bottom-right"    // Position: bottom-right, bottom-left, etc
  autoPlay={false}           // Auto-play consent
  maxPlaylist={5}            // Number of newsletters in playlist
/>
```

### Subscribing to Podcast

Users can subscribe via:
1. **RSS URL**: `https://yourdomain.com/api/rss/podcast`
2. **iTunes**: Search for your podcast name in Apple Podcasts
3. **Other Apps**: Copy RSS URL to any podcast app

## Templates

Available newsletter templates:

- **morning_briefing**: Top news from last 24 hours
- **evening_digest**: Day's highlights  
- **weekly_analysis**: Weekly roundup with insights
- **breaking_news**: Urgent news alerts
- **tech_update**: Technology news digest
- **business_report**: Business and finance updates
- **sports_highlights**: Sports news and scores

## Monitoring

### Check Scheduler Status

```javascript
GET /api/audio-newsletters/scheduler/status

Response:
{
  "active": true,
  "schedules": [
    {
      "name": "morning_briefing", 
      "cronSchedule": "0 6 * * *",
      "nextRun": "2024-01-15T06:00:00Z",
      "lastRun": "2024-01-14T06:00:00Z"
    }
  ]
}
```

### View Generation Queue

```javascript
GET /api/audio-newsletters/queue

Response:
{
  "queueLength": 3,
  "processing": 1,
  "jobs": [...]
}
```

## Troubleshooting

### Common Issues

1. **Scheduler not running**:
   - Check `ENABLE_NEWSLETTER_SCHEDULER=true`
   - Verify `ENABLE_BACKGROUND_WORKERS=true`
   - Check server logs for errors

2. **Audio not generating**:
   - Verify ElevenLabs API key
   - Check job queue for failures
   - Review error logs in `/tmp/logs/`

3. **RSS feed not updating**:
   - Ensure newsletters have `status: 'published'`
   - Check audio URLs are accessible
   - Verify RSS endpoint is public

4. **Widget not playing audio**:
   - Check browser console for CORS errors
   - Verify audio URLs are valid
   - Check localStorage permissions

### Debug Commands

```bash
# Check scheduler logs
grep "Newsletter scheduler" /tmp/logs/Start_application*.log

# Check generation errors  
grep "Error processing scheduled newsletters" /tmp/logs/Start_application*.log

# Monitor job queue
tail -f /tmp/logs/Start_application*.log | grep "JobQueue"
```

## Best Practices

1. **Schedule newsletters during low-traffic hours** to optimize server resources
2. **Use appropriate templates** for different content types
3. **Monitor generation queue** to prevent backlogs
4. **Set reasonable retry limits** for failed generations
5. **Test audio quality** with different voice settings
6. **Validate RSS feed** with podcast validators
7. **Implement caching** for frequently accessed newsletters

## Support

For issues or questions:
1. Check server logs in `/tmp/logs/`
2. Review this documentation
3. Contact system administrator
4. Submit issue to project repository