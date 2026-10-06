-- عرض تجديد الباقة ورد الوكالة عليه (طلبات renewal).
-- إضافي فقط: عمود قابل للفراغ، لا يغيّر أي صف موجود.
-- يُطبَّق على الإنتاج قبل نشر الكود الذي يقرأ العمود.
-- التراجع: ALTER TABLE publisher_requests DROP COLUMN IF EXISTS offer;  (لا يُنفذ إلا بقرار صريح)
ALTER TABLE publisher_requests ADD COLUMN IF NOT EXISTS offer jsonb;
