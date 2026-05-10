import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { useState, useMemo, useRef, useEffect } from 'react';
import { galleryStore } from '@/lib/galleryStore';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { GripVertical, Trash2, Pencil, Images, Plus, Upload, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getCsrfToken } from '@/lib/queryClient';

interface GalleryImage {
  src: string;
  caption?: string;
  id?: string;
}

interface DraftImage extends GalleryImage {
  id: string;
}

interface SortableImageItemProps {
  image: DraftImage;
  index: number;
  onCaptionChange: (id: string, caption: string) => void;
  onDelete: (id: string) => void;
}

function generateImageId(src: string, index: number): string {
  let hash = 0;
  for (let i = 0; i < src.length; i++) {
    const char = src.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `img-${Math.abs(hash)}-${index}`;
}

function SortableImageItem({ image, index, onCaptionChange, onDelete }: SortableImageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      dir="rtl"
      className={`flex items-start gap-3 p-3 bg-card border rounded-lg ${isDragging ? 'shadow-lg' : ''}`}
    >
      {/* Image Preview */}
      <div className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-muted">
        <img
          src={image.src}
          alt={image.caption || `صورة ${index + 1}`}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Caption Input */}
      <div className="flex-1 space-y-1">
        <label className="text-xs text-muted-foreground">
          وصف الصورة {index + 1} (اختياري)
        </label>
        <Input
          value={image.caption || ''}
          onChange={(e) => onCaptionChange(image.id, e.target.value)}
          placeholder="أدخل وصف الصورة..."
          dir="rtl"
          className="text-sm"
          data-testid={`caption-input-${index}`}
        />
      </div>

      {/* Delete Button */}
      <Button
        type="button"
        variant="destructive"
        size="icon"
        onClick={() => onDelete(image.id)}
        className="flex-shrink-0"
        data-testid={`delete-image-${index}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      {/* Drag Handle */}
      <button
        type="button"
        className="flex-shrink-0 p-1 text-muted-foreground cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
        data-testid={`drag-handle-${index}`}
      >
        <GripVertical className="h-5 w-5" />
      </button>
    </div>
  );
}

export function ImageGalleryNodeView({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [draftImages, setDraftImages] = useState<DraftImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  const images: GalleryImage[] = node.attrs.images || [];
  
  // Get or generate gallery ID
  const galleryId = node.attrs.galleryId || (() => {
    const newId = galleryStore.generateId();
    // Set the ID on the node
    setTimeout(() => updateAttributes({ galleryId: newId }), 0);
    return newId;
  })();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const MAX_ALBUM_IMAGES = 20;

  const handleAddImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    // Check max images limit
    const remainingSlots = MAX_ALBUM_IMAGES - draftImages.length;
    if (remainingSlots <= 0) {
      toast({
        title: 'خطأ',
        description: `الحد الأقصى للألبوم ${MAX_ALBUM_IMAGES} صورة`,
        variant: 'destructive',
      });
      return;
    }
    
    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    if (filesToUpload.length < files.length) {
      toast({
        title: 'تنبيه',
        description: `سيتم رفع ${filesToUpload.length} صور فقط (الحد الأقصى ${MAX_ALBUM_IMAGES})`,
      });
    }
    
    setIsUploading(true);
    setUploadProgress(0);
    
    const newImages: DraftImage[] = [];
    const totalFiles = filesToUpload.length;
    
    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: 'خطأ',
          description: `الملف "${file.name}" ليس صورة`,
          variant: 'destructive',
        });
        continue;
      }
      
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'خطأ',
          description: `الملف "${file.name}" أكبر من 10 ميجابايت`,
          variant: 'destructive',
        });
        continue;
      }
      
      try {
        const formData = new FormData();
        formData.append('file', file);
        
        const csrfToken = getCsrfToken();
        const headers: HeadersInit = {};
        if (csrfToken) {
          headers['x-csrf-token'] = csrfToken;
        }
        
        const response = await fetch('/api/media/upload', {
          method: 'POST',
          headers,
          body: formData,
          credentials: 'include',
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'فشل رفع الصورة');
        }
        
        const data = await response.json();
        const imageUrl = data.url;
        
        if (imageUrl) {
          const newImage: DraftImage = {
            src: imageUrl,
            caption: '',
            id: generateImageId(imageUrl, draftImages.length + newImages.length),
          };
          newImages.push(newImage);
        }
        
        setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
      } catch (error) {
        toast({
          title: 'خطأ',
          description: `فشل رفع "${file.name}"`,
          variant: 'destructive',
        });
      }
    }
    
    if (newImages.length > 0) {
      setDraftImages(prev => [...prev, ...newImages]);
      toast({
        title: 'تم الرفع',
        description: `تم رفع ${newImages.length} صورة بنجاح`,
      });
    }
    
    setIsUploading(false);
    setUploadProgress(0);
    
    // Clear file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const openEditDialog = () => {
    const drafts: DraftImage[] = images.map((img, i) => ({
      ...img,
      id: img.id || generateImageId(img.src, i),
    }));
    setDraftImages(drafts);
    setIsEditOpen(true);
  };

  const sortableIds = useMemo(() => draftImages.map(img => img.id), [draftImages]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setDraftImages((items) => {
        const oldIndex = items.findIndex((img) => img.id === active.id);
        const newIndex = items.findIndex((img) => img.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleCaptionChange = (id: string, caption: string) => {
    setDraftImages((items) => 
      items.map((img) => img.id === id ? { ...img, caption } : img)
    );
  };

  const handleDelete = (id: string) => {
    setDraftImages((items) => items.filter((img) => img.id !== id));
  };

  const handleSave = () => {
    const savedImages: GalleryImage[] = draftImages.map(({ src, caption }) => ({ src, caption }));
    console.log('[PhotoAlbum] Saving images:', savedImages);
    console.log('[PhotoAlbum] Number of images:', savedImages.length);
    console.log('[PhotoAlbum] Gallery ID:', galleryId);
    
    // Store in global gallery store using gallery ID (this bypasses TipTap atom node issue)
    galleryStore.set(galleryId, savedImages);
    console.log('[PhotoAlbum] Saved to galleryStore with ID:', galleryId);
    
    // Also try updateAttributes (may not work with atom nodes, but try anyway)
    updateAttributes({ images: savedImages, galleryId });
    console.log('[PhotoAlbum] updateAttributes called');
    
    setIsEditOpen(false);
  };
  
  // Sync to gallery store whenever images change from node.attrs
  useEffect(() => {
    if (images.length > 0 && galleryId) {
      galleryStore.set(galleryId, images);
      console.log('[PhotoAlbum] Synced to galleryStore with ID:', galleryId, 'images:', images.length);
    }
  }, [images, galleryId]);

  const handleCancel = () => {
    setDraftImages([]);
    setIsEditOpen(false);
  };

  return (
    <NodeViewWrapper className="photo-album-wrapper my-4" dir="rtl">
      {/* Album Display */}
      <div
        className={`relative rounded-lg border-2 border-dashed p-4 transition-colors cursor-pointer ${
          selected ? 'border-primary bg-primary/5' : 'border-muted'
        }`}
        onClick={openEditDialog}
        data-testid="photo-album-container"
      >
        {/* Edit Overlay */}
        <div className="absolute top-2 left-2 z-10">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openEditDialog();
            }}
            className="gap-1 shadow-sm"
            data-testid="button-edit-album"
          >
            <Pencil className="h-3 w-3" />
            تعديل الألبوم
          </Button>
        </div>

        {/* Album Header */}
        <div className="flex items-center gap-2 mb-4 text-muted-foreground">
          <Images className="h-5 w-5" />
          <span className="text-sm font-medium">ألبوم صور ({images.length} صور)</span>
        </div>

        {/* Images Grid Preview */}
        {images.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Images className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>الألبوم فارغ - اضغط للتعديل</p>
          </div>
        ) : (
          <div className="space-y-4">
            {images.map((image, index) => (
              <div key={index} className="space-y-2">
                <img
                  src={image.src}
                  alt={image.caption || `صورة ${index + 1}`}
                  className="w-full h-auto rounded-lg"
                />
                {image.caption && (
                  <p className="text-center text-sm text-muted-foreground px-2">
                    {image.caption}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Images className="h-5 w-5" />
              تعديل ألبوم الصور
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            {/* Add Images Button */}
            <div className="mb-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => handleAddImages(e.target.files)}
                className="hidden"
                data-testid="album-file-input"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full gap-2"
                data-testid="button-add-images"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جاري الرفع... {uploadProgress}%
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    إضافة صور جديدة
                  </>
                )}
              </Button>
              {isUploading && (
                <Progress value={uploadProgress} className="mt-2" />
              )}
            </div>

            {draftImages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Upload className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>لا توجد صور في الألبوم</p>
                <p className="text-sm mt-1">اضغط على "إضافة صور جديدة" لإضافة صور</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground mb-4">
                  اسحب الصور لإعادة ترتيبها، أو عدّل الوصف، أو احذف صوراً
                </p>
                
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={sortableIds}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {draftImages.map((image, index) => (
                        <SortableImageItem
                          key={image.id}
                          image={image}
                          index={index}
                          onCaptionChange={handleCaptionChange}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 flex-row-reverse">
            <Button onClick={handleSave} disabled={isUploading} data-testid="button-save-album">
              حفظ التغييرات
            </Button>
            <Button variant="outline" onClick={handleCancel} disabled={isUploading}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </NodeViewWrapper>
  );
}
