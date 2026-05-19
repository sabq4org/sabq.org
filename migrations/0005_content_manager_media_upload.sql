-- Migration: grant media upload permissions to content_manager
-- Created: 2026-05-19
-- Purpose: allow content managers to upload article album images and media.

INSERT INTO permissions (code, label, label_ar, module, description)
VALUES
  ('media.view', 'View Media', 'عرض الوسائط', 'media', 'View media library'),
  ('media.upload', 'Upload Media', 'رفع الوسائط', 'media', 'Upload media files'),
  ('media_library.upload', 'Upload Media', 'رفع ملفات', 'media_library', 'رفع ملفات جديدة'),
  ('media_library.view', 'View Media Library', 'عرض مكتبة الوسائط', 'media_library', 'عرض الملفات والصور')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'media.view',
  'media.upload',
  'media_library.upload',
  'media_library.view'
)
WHERE r.name = 'content_manager'
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions rp
    WHERE rp.role_id = r.id
      AND rp.permission_id = p.id
  );
