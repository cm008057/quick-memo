-- Supabaseデータベース修正スクリプト
-- 実行方法: Supabaseダッシュボード > SQL Editor でこのスクリプトを実行

-- 1. memosテーブルに不足している列を追加
ALTER TABLE public.memos
ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false;

ALTER TABLE public.memos
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW());

-- 2. 既存データの修復（NULL値をデフォルト値に設定）
UPDATE public.memos
SET deleted = false
WHERE deleted IS NULL;

UPDATE public.memos
SET updated_at = created_at
WHERE updated_at IS NULL;

-- 3. インデックスを追加（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_memos_deleted ON public.memos(deleted);
CREATE INDEX IF NOT EXISTS idx_memos_updated_at ON public.memos(updated_at);
CREATE INDEX IF NOT EXISTS idx_memos_user_deleted ON public.memos(user_id, deleted);

-- 4. 確認クエリ
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM
    information_schema.columns
WHERE
    table_name = 'memos'
    AND table_schema = 'public'
ORDER BY
    ordinal_position;