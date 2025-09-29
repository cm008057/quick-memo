# クイックメモアプリ - Vercel + Supabase版

既存のHTML版クイックメモアプリを Next.js + Supabase + Vercel で完全再現したアプリです。
デザインと機能を100%維持したまま、スケーラブルなクラウド環境で動作します。

## 🚀 特徴

- **完全同一のデザイン**: 元のアプリと全く同じスタイル・レイアウト
- **全機能保持**: 音声入力、ドラッグ&ドロップ、カテゴリ管理など
- **レスポンシブ対応**: モバイル・デスクトップ両対応
- **データ移行対応**: LocalStorageからSupabaseへの移行機能
- **クラウド同期**: Supabaseによるデータベース管理

## 🛠 技術スタック

- **Frontend**: Next.js 15 + TypeScript
- **Database**: Supabase (PostgreSQL)
- **Deployment**: Vercel
- **Styling**: Custom CSS (元アプリの完全移植)

## 📦 機能一覧

### コア機能
- ✅ メモの作成・編集・削除
- ✅ 音声入力（🎤ボタン）
- ✅ カテゴリ管理（6つのデフォルト + カスタム）
- ✅ ドラッグ&ドロップでの並べ替え
- ✅ フィルタリング・ソート機能
- ✅ 完了/未完了の管理

### データ管理
- ✅ データエクスポート/インポート
- ✅ LocalStorageからの移行機能
- ✅ Supabaseでのクラウド同期

### レスポンシブ対応
- ✅ iPhone 15対応
- ✅ iPad対応
- ✅ デスクトップ対応

## 🔧 セットアップ

### 1. 環境変数の設定

`.env.local` ファイルを作成し、Supabaseの認証情報を設定：

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 2. Supabaseデータベースの設定

`supabase-schema.sql` のSQLを実行してテーブルを作成：

```sql
-- memos, categories, memo_orders テーブルの作成
-- 詳細は supabase-schema.sql を参照
```

### 3. インストール・起動

```bash
npm install
npm run dev
```

### 4. Vercelデプロイ

```bash
vercel --prod
```

## 📊 データ移行

既存のLocalStorageデータをSupabaseに移行する場合：

1. アプリにアクセス
2. 既存データが自動検出される
3. 「Supabaseに移行」ボタンで移行実行

## 🎯 元アプリとの互換性

- **デザイン**: 100%同一
- **機能**: 100%同一
- **データ**: インポート/エクスポートで完全互換
- **操作性**: 全く同じUI/UX

## 📁 プロジェクト構造

```
quick-memo-vercel/
├── app/
│   ├── page.tsx          # メインアプリケーション
│   ├── memo-styles.css   # 元アプリのCSS完全移植
│   └── globals.css       # グローバルスタイル
├── lib/
│   ├── supabase.ts       # Supabaseクライアント
│   ├── migration.ts      # データ移行機能
│   └── database.types.ts # TypeScript型定義
├── supabase-schema.sql   # データベース構造
└── README.md             # このファイル
```

## 🔄 移行後の利点

1. **スケーラビリティ**: クラウドベースで無制限拡張
2. **データ永続化**: LocalStorageの制限を超える
3. **マルチデバイス**: 複数デバイス間でデータ同期
4. **バックアップ**: 自動バックアップ・復旧機能
5. **パフォーマンス**: Vercelの高速CDN配信

## 🚨 重要な注意事項

元のHTMLファイルは一切変更されていません。
このVercel版は完全に独立したアプリケーションです。
