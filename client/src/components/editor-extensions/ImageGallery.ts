import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ImageGalleryNodeView } from './ImageGalleryNodeView';

export interface GalleryImage {
  src: string;
  caption?: string;
}

export interface ImageGalleryOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageGallery: {
      setImageGallery: (options: { images: GalleryImage[]; galleryId?: string }) => ReturnType;
      updateImageGallery: (options: { images: GalleryImage[]; galleryId?: string }) => ReturnType;
    };
  }
}

export const ImageGallery = Node.create<ImageGalleryOptions>({
  name: 'imageGallery',

  group: 'block',

  atom: true,

  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      galleryId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-gallery-id'),
        renderHTML: (attributes) => {
          if (!attributes.galleryId) return {};
          return { 'data-gallery-id': attributes.galleryId };
        },
      },
      images: {
        default: [],
        parseHTML: (element) => {
          const imagesAttr = element.getAttribute('data-images');
          if (!imagesAttr) return [];
          try {
            const parsed = JSON.parse(imagesAttr);
            // Handle both old format (string[]) and new format ({src, caption}[])
            if (Array.isArray(parsed)) {
              return parsed.map(item => {
                if (typeof item === 'string') {
                  return { src: item, caption: '' };
                }
                return item;
              });
            }
            return [];
          } catch {
            return [];
          }
        },
        renderHTML: (attributes) => {
          if (!attributes.images || attributes.images.length === 0) {
            return {};
          }
          return {
            'data-images': JSON.stringify(attributes.images),
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-image-gallery]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const images: GalleryImage[] = HTMLAttributes.images || [];
    const galleryId = HTMLAttributes.galleryId || '';
    
    // Build children array for TipTap rendering (for HTML output/saving)
    const children: any[] = [];
    
    images.forEach((image: GalleryImage) => {
      children.push([
        'div',
        { class: 'album-image-container', style: 'margin-bottom: 24px;' },
        [
          'img',
          {
            src: image.src,
            alt: image.caption || 'صورة من الألبوم',
            style: 'width: 100%; height: auto; border-radius: 8px; display: block;',
          },
        ],
        ...(image.caption ? [
          [
            'p',
            {
              style: 'text-align: center; font-size: 14px; color: #666; margin-top: 8px; padding: 0 8px;',
            },
            image.caption,
          ],
        ] : []),
      ]);
    });
    
    const attrs: Record<string, string> = {
      'data-image-gallery': '',
      'data-images': JSON.stringify(images),
      class: 'photo-album',
      style: 'width: 100%; padding: 16px 0;',
    };
    
    // Add gallery ID if present
    if (galleryId) {
      attrs['data-gallery-id'] = galleryId;
    }
    
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, attrs),
      ...children,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageGalleryNodeView);
  },

  addCommands() {
    return {
      setImageGallery:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
      updateImageGallery:
        (options) =>
        ({ commands, state }) => {
          const { selection } = state;
          return commands.updateAttributes(this.name, options);
        },
    };
  },
});
