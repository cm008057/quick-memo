import { createBrowserClient } from '@supabase/ssr'

export const createClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // 環境変数が設定されていない場合はnullを返す
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase環境変数が設定されていません。ローカルストレージモードで動作します。')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return null as any
  }

  return createBrowserClient(
    supabaseUrl,
    supabaseAnonKey,
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