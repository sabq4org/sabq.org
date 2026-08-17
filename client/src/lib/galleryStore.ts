// Global store for image gallery data, keyed by unique gallery IDs.
// Kept as a safety net alongside node attrs (renderHTML now serializes
// attrs correctly, so this store is no longer on the save path).

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
}

const galleries = new Map<string, GalleryImage[]>();

export const galleryStore: GalleryStore = {
  galleries,
  
  set: (galleryId: string, images: GalleryImage[]) => {
    galleries.set(galleryId, images);
  },
  
  get: (galleryId: string) => {
    return galleries.get(galleryId);
  },
  
  getAll: () => {
    return galleries;
  },
  
  clear: () => {
    galleries.clear();
  },
  
  generateId: () => {
    return `gallery-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  },
};
