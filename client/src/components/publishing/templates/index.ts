/**
 * Publishing Templates - Barrel Export
 * 
 * Centralized export for all publishing templates.
 * Enables easy importing: `import { HeroSplit, NewsListBasic } from '@/components/publishing/templates'`
 */

// Hero Templates
export { default as HeroSplit } from './HeroSplit';
export { default as HeroOverlay } from './HeroOverlay';

// News List Templates
export { default as NewsListBasic } from './NewsListBasic';
export { default as NewsListSummary } from './NewsListSummary';

// News Grid Templates
export { default as NewsGridTwoCol } from './NewsGridTwoCol';
export { default as NewsGridMasonry } from './NewsGridMasonry';

// Ticker Templates
export { default as TickerInline } from './TickerInline';
export { default as TickerMarquee } from './TickerMarquee';

// Timeline Templates
export { default as TimelineVertical } from './TimelineVertical';
export { default as TimelineHorizontal } from './TimelineHorizontal';

// Spotlight Templates
export { default as SpotlightCard } from './SpotlightCard';
export { default as SpotlightMedia } from './SpotlightMedia';

// Media Templates
export { default as VideoReel } from './VideoReel';
export { default as PodcastRow } from './PodcastRow';

// Live Templates
export { default as LiveStream } from './LiveStream';

// Infographic Templates
export { default as InfographicStatBar } from './InfographicStatBar';

// Tag Templates
export { default as TagStripChips } from './TagStripChips';

// Newsletter Templates
export { default as NewsletterBlock } from './NewsletterBlock';

// Native Templates
export { default as NativeStory } from './NativeStory';

// Opinion Templates
export { default as OpinionColumn } from './OpinionColumn';

// Mosaic Templates
export { default as MosaicMagazine } from './MosaicMagazine';

/**
 * Template registry mapping template IDs to components
 * Used by Template Selector Engine for dynamic loading
 */
export const TEMPLATE_REGISTRY = {
  // Hero
  'hero.split': HeroSplit,
  'hero.overlay': HeroOverlay,
  
  // News List
  'news_list.basic': NewsListBasic,
  'news_list.summary': NewsListSummary,
  
  // News Grid
  'news_grid.two_col': NewsGridTwoCol,
  'news_grid.masonry': NewsGridMasonry,
  
  // Ticker
  'ticker.inline': TickerInline,
  'ticker.marquee': TickerMarquee,
  
  // Timeline
  'timeline.vertical': TimelineVertical,
  'timeline.horizontal': TimelineHorizontal,
  
  // Spotlight
  'spotlight.card': SpotlightCard,
  'spotlight.media': SpotlightMedia,
  
  // Media
  'media.video_reel': VideoReel,
  'media.podcast_row': PodcastRow,
  
  // Live
  'live.stream': LiveStream,
  
  // Infographic
  'infographic.statbar': InfographicStatBar,
  
  // Tags
  'tag_strip.chips': TagStripChips,
  
  // Newsletter
  'newsletter.block': NewsletterBlock,
  
  // Native
  'native.story': NativeStory,
  
  // Opinion
  'opinion.column': OpinionColumn,
  
  // Mosaic
  'mosaic.magazine': MosaicMagazine,
} as const;

export type TemplateId = keyof typeof TEMPLATE_REGISTRY;
