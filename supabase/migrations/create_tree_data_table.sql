-- ツリー管理用テーブル作成
CREATE TABLE IF NOT EXISTS tree_data (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  templates jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS (Row Level Security) を有効化
ALTER TABLE tree_data ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のデータのみ参照可能
CREATE POLICY "Users can view their own tree data"
  ON tree_data
  FOR SELECT
  USING (auth.uid() = user_id);

-- ユーザーは自分のデータのみ挿入可能
CREATE POLICY "Users can insert their own tree data"
  ON tree_data
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ユーザーは自分のデータのみ更新可能
CREATE POLICY "Users can update their own tree data"
  ON tree_data
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ユーザーは自分のデータのみ削除可能
CREATE POLICY "Users can delete their own tree data"
  ON tree_data
  FOR DELETE
  USING (auth.uid() = user_id);

-- updated_at を自動更新するトリガー関数
CREATE OR REPLACE FUNCTION update_tree_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガーを設定
CREATE TRIGGER tree_data_updated_at
  BEFORE UPDATE ON tree_data
  FOR EACH ROW
  EXECUTE FUNCTION update_tree_data_updated_at();
