import { createBrowserClient } from '@supabase/ssr'

export const createClient = () => {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // セッションを永続化するためにローカルストレージを使用
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        // セッションの自動リフレッシュを有効化
        autoRefreshToken: true,
        // セッション検出を有効化
        detectSessionInUrl: true,
        // より長いセッション期間を設定（デフォルトは3600秒、これを24時間に設定）
        persistSession: true,
      },
    }
  )
}