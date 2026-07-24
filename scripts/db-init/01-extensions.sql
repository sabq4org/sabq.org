-- يعمل تلقائيًا عند إنشاء volume جديد فقط (docker-entrypoint-initdb.d).
-- على volume قائم شغّله يدويًا مرة واحدة قبل db:push:local.
CREATE EXTENSION IF NOT EXISTS vector;
