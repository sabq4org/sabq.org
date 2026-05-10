/**
 * Publishing Templates System - Type Definitions
 * نظام التمبلتات المتنوعة للنشر
 */

export type TemplateKind =
  | "list"
  | "grid"
  | "hero"
  | "ticker"
  | "timeline"
  | "spotlight"
  | "mosaic"
  | "live"
  | "media"
  | "infographic"
  | "tags"
  | "newsletter"
  | "native";

export type PaginationType = "none" | "loadMore" | "infinite";
export type AnimationMode = "subtle" | "none";
export type DensityMode = "compact" | "cozy" | "comfortable";
export type RadiusSize = "md" | "lg" | "2xl";
export type ElevationLevel = "none" | "sm" | "md";
export type HydrationHint = "client" | "server" | "rsc";
export type ImagePolicy = "next/image cover" | "next/image contain" | "no-image";
export type Viewport = "mobile" | "tablet" | "desktop" | "all";

export interface DataBinding {
  input: string; // e.g., "Collection<Article>" or "Article"
  requiredFields: string[];
  optionalFields: string[];
}

export interface TemplateBehaviors {
  pagination: PaginationType;
  animation: AnimationMode;
  skeleton: boolean;
  virtualize: boolean;
}

export interface TemplateStyles {
  density: DensityMode;
  radius: RadiusSize;
  elevation: ElevationLevel;
  accent: string;
  allowOverride: string[];
}

export interface TemplateA11y {
  roles: string[];
  contrastMin: number;
  keyboardNav: boolean;
}

export type PlacementSlot =
  | "hero_top"
  | "below_featured"
  | "above_all_news"
  | "between_all_and_murqap"
  | "above_footer"
  | "sidebar_primary"
  | "sidebar_secondary"
  | "in_stream";

export interface TemplatePerformance {
  hydrationHint: HydrationHint;
  imagePolicy: ImagePolicy;
  maxItems: number;
}

export interface TemplateAnalytics {
  viewEvent: string;
  clickEvent: string;
  props: string[];
}

export interface TemplateComponent {
  name: string;
  path: string;
  props: string[];
}

export interface TemplatePreview {
  demoData: string;
  thumbnail: string;
}

export interface TemplateConstraints {
  minItems: number;
  maxTitleLen?: number;
  maxDescLen?: number;
}

export interface ScoreHints {
  urgency?: number;
  hasImages?: number;
  hasVideo?: number;
  readingDepth?: number;
  viewport?: Viewport;
}

export interface PublishingTemplate {
  id: string;
  name: string;
  kind: TemplateKind;
  description: string;
  bestFor: string[];
  dataBinding: DataBinding;
  behaviors: TemplateBehaviors;
  styles: TemplateStyles;
  a11y: TemplateA11y;
  placements: PlacementSlot[];
  performance: TemplatePerformance;
  analytics: TemplateAnalytics;
  component: TemplateComponent;
  preview: TemplatePreview;
  constraints: TemplateConstraints;
  scoreHints: ScoreHints;
}

export interface SelectionRule {
  if: Record<string, any>;
  prefer: string[];
  boost: number;
}

export interface SelectionPolicy {
  inputs: string[];
  scoring: "weighted" | "priority";
  rules: SelectionRule[];
  fallback: string;
}

export interface TemplatesManifest {
  version: string;
  templates: PublishingTemplate[];
  selectionPolicy: SelectionPolicy;
}

// Template Props Types
export interface BaseTemplateProps {
  title?: string;
  accent?: string;
  className?: string;
  onItemClick?: (item: any, index: number) => void;
  onView?: () => void;
}

export interface ArticleItem {
  id: string;
  title: string;
  slug: string;
  image?: string;
  publishedAt?: string;
  category?: {
    id: string;
    name: string;
    slug: string;
    color?: string;
  };
  excerpt?: string;
  author?: {
    id: string;
    name: string;
    avatar?: string;
  };
  reporter?: {
    id: string;
    name: string;
    avatar?: string;
  };
  views?: number;
  likes?: number;
  commentsCount?: number;
  readingTime?: number;
  videoUrl?: string;
  newsType?: "breaking" | "featured" | "regular";
  seo?: {
    keywords?: string[];
  };
}

export interface ListTemplateProps extends BaseTemplateProps {
  items: ArticleItem[];
  limit?: number;
  showMeta?: boolean;
  showCategory?: boolean;
  showImage?: boolean;
  showExcerpt?: boolean;
  density?: DensityMode;
}

export interface GridTemplateProps extends BaseTemplateProps {
  items: ArticleItem[];
  limit?: number;
  columns?: 2 | 3 | 4;
  showMeta?: boolean;
  density?: DensityMode;
}

export interface HeroTemplateProps extends BaseTemplateProps {
  item: ArticleItem;
  layout?: "split" | "overlay";
}

export interface TickerTemplateProps extends BaseTemplateProps {
  items: ArticleItem[];
  speed?: "slow" | "medium" | "fast";
  pauseOnHover?: boolean;
}

export interface TimelineTemplateProps extends BaseTemplateProps {
  items: ArticleItem[];
  orientation?: "vertical" | "horizontal";
  showDates?: boolean;
}

export interface SpotlightTemplateProps extends BaseTemplateProps {
  item: ArticleItem;
  variant?: "card" | "media";
}

// Selection Context
export interface SelectionContext {
  placement: PlacementSlot;
  contentType?: "news" | "opinion" | "analysis" | "column";
  urgency?: "low" | "medium" | "high";
  hasVideo?: boolean;
  hasInfographics?: boolean;
  viewport?: Viewport;
  collectionStats?: {
    itemCount: number;
    hasImages: number;
    hasVideos: number;
    avgTitleLength: number;
  };
}

// Template Score Result
export interface TemplateScore {
  templateId: string;
  score: number;
  matchedRules: string[];
}
