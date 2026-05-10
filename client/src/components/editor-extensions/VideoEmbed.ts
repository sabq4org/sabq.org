import { Node, mergeAttributes } from '@tiptap/core';

export interface VideoEmbedOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    videoEmbed: {
      setVideoEmbed: (options: { url: string }) => ReturnType;
    };
  }
}

const getVideoEmbedUrl = (url: string | null | undefined): string | null => {
  // Safety check: return null if url is null, undefined, or empty
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    return null;
  }

  // YouTube
  const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const youtubeMatch = url.match(youtubeRegex);
  if (youtubeMatch && youtubeMatch[1]) {
    return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
  }

  // Dailymotion - use geo.dailymotion.com for better compatibility
  const dailymotionRegex = /(?:dailymotion\.com\/(?:video|hub)\/|dai\.ly\/)([a-zA-Z0-9]+)/;
  const dailymotionMatch = url.match(dailymotionRegex);
  if (dailymotionMatch && dailymotionMatch[1]) {
    return `https://geo.dailymotion.com/player.html?video=${dailymotionMatch[1]}`;
  }

  return null;
};

export const VideoEmbed = Node.create<VideoEmbedOptions>({
  name: 'videoEmbed',

  group: 'block',

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      url: {
        default: null,
      },
      embedUrl: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-video-embed]',
        getAttrs: (dom) => {
          if (typeof dom === 'string') return {};
          const element = dom as HTMLElement;
          return {
            url: element.getAttribute('data-url'),
            embedUrl: element.getAttribute('data-embed-url'),
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const embedUrl = HTMLAttributes.embedUrl || getVideoEmbedUrl(HTMLAttributes.url);
    
    if (!embedUrl) {
      return ['div', { class: 'my-4 p-4 border rounded-md text-muted-foreground' }, 'رابط الفيديو غير صحيح'];
    }

    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, {
        'data-video-embed': '',
        'data-url': HTMLAttributes.url,
        'data-embed-url': embedUrl,
        class: 'video-embed-wrapper my-4',
      }),
      [
        'iframe',
        {
          src: embedUrl,
          class: 'w-full aspect-video rounded-md',
          frameborder: '0',
          allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
          allowfullscreen: 'true',
        },
      ],
    ];
  },

  addCommands() {
    return {
      setVideoEmbed:
        (options) =>
        ({ commands }) => {
          const embedUrl = getVideoEmbedUrl(options.url);
          if (!embedUrl) {
            return false;
          }
          
          return commands.insertContent({
            type: this.name,
            attrs: {
              url: options.url,
              embedUrl,
            },
          });
        },
    };
  },
});
