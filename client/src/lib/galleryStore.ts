// Global store for image gallery data
// This bypasses TipTap's atom node limitation where attrs don't persist properly
// Uses unique gallery IDs instead of positions to handle content changes

export interface GalleryImage {
  src: string;
  caption?: string;
}

interface GalleryStore {
  galleries: Map<string, GalleryImage[]>;
  
  set: (galleryId: string, images: GalleryImage[]) => void;
  get: (galleryId: string) => GalleryImage[] | undefined;
  getAll: () => Map<string, GalleryImage[]>;
  clear: () => void;
  generateId: () => string;
  
  // For updating HTML before save
  updateHtmlWithGalleryData: (html: string) => string;
}

const galleries = new Map<string, GalleryImage[]>();

export const galleryStore: GalleryStore = {
  galleries,
  
  set: (galleryId: string, images: GalleryImage[]) => {
    console.log('[GalleryStore] Setting images for gallery', galleryId, ':', images.length, 'images');
    galleries.set(galleryId, images);
  },
  
  get: (galleryId: string) => {
    return galleries.get(galleryId);
  },
  
  getAll: () => {
    return galleries;
  },
  
  clear: () => {
    console.log('[GalleryStore] Clearing all galleries');
    galleries.clear();
  },
  
  generateId: () => {
    return `gallery-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  },
  
  // Update HTML to include gallery images before saving
  // Now uses gallery IDs for reliable matching
  updateHtmlWithGalleryData: (html: string) => {
    console.log('[GalleryStore] Updating HTML with gallery data');
    console.log('[GalleryStore] Galleries count:', galleries.size);
    
    if (galleries.size === 0) {
      return html;
    }
    
    // Replace each gallery div with updated data-images based on its ID
    let updatedHtml = html.replace(
      /<div[^>]*data-image-gallery[^>]*data-gallery-id="([^"]*)"[^>]*>/g,
      (match, galleryId) => {
        const images = galleries.get(galleryId) || [];
        const imagesJson = JSON.stringify(images);
        console.log('[GalleryStore] Replacing gallery', galleryId, 'with', images.length, 'images');
        
        // Rebuild the div with correct data-images (standardize format)
        return `<div data-image-gallery="" data-gallery-id="${galleryId}" data-images="${imagesJson.replace(/"/g, '&quot;')}" class="photo-album" style="width: 100%; padding: 16px 0;">`;
      }
    );
    
    // Also handle galleries without ID (legacy format) - use order-based matching
    if (updatedHtml.includes('data-image-gallery') && !updatedHtml.includes('data-gallery-id')) {
      const allGalleryImages: GalleryImage[][] = [];
      galleries.forEach((images) => {
        allGalleryImages.push(images);
      });
      
      let galleryIndex = 0;
      updatedHtml = updatedHtml.replace(
        /<div[^>]*data-image-gallery(?![^>]*data-gallery-id)[^>]*>/g,
        (match) => {
          const images = allGalleryImages[galleryIndex] || [];
          const newId = galleryStore.generateId();
          galleryIndex++;
          
          const imagesJson = JSON.stringify(images);
          console.log('[GalleryStore] Replacing legacy gallery', galleryIndex, 'with', images.length, 'images, assigning ID:', newId);
          
          return `<div data-image-gallery="" data-gallery-id="${newId}" data-images="${imagesJson.replace(/"/g, '&quot;')}" class="photo-album" style="width: 100%; padding: 16px 0;">`;
        }
      );
    }
    
    // Add image children inside the gallery div for proper display
    const finalHtml = updatedHtml.replace(
      /(<div data-image-gallery=""[^>]*data-images="([^"]*)"[^>]*>)([\s\S]*?)(<\/div>)/g,
      (match, openTag, imagesAttr, content, closeTag) => {
        let images: GalleryImage[] = [];
        try {
          images = JSON.parse(imagesAttr.replace(/&quot;/g, '"'));
        } catch (e) {
          console.error('[GalleryStore] Failed to parse images:', e);
        }
        
        // Build image HTML
        const imagesHtml = images.map(img => 
          `<div class="album-image-container" style="margin-bottom: 24px;"><img src="${img.src}" alt="${img.caption || 'صورة من الألبوم'}" style="width: 100%; height: auto; border-radius: 8px; display: block;">${img.caption ? `<p style="text-align: center; font-size: 14px; color: #666; margin-top: 8px; padding: 0 8px;">${img.caption}</p>` : ''}</div>`
        ).join('');
        
        return openTag + imagesHtml + closeTag;
      }
    );
    
    console.log('[GalleryStore] HTML update complete');
    return finalHtml;
  }
};
