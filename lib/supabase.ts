import { createBrowserClient } from '@supabase/ssr'

export const createClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  // デバッグ情報を簡略化
  if (!supabaseUrl || !supabaseAnonKey) {
    console.log('🟠 Supabase未設定 - ローカルストレージモード')
  }

  // 環境変数が設定されていない場合はnullを返す
  if (!supabaseUrl || !supabaseAnonKey) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return null as any
  }

  // URLの形式をチェック
  if (!supabaseUrl.startsWith('http')) {
    console.error('Supabase URLが正しい形式ではありません:', supabaseUrl)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return null as any
  }

  // 不正な文字を除去
  const cleanUrl = supabaseUrl.replace(/[\r\n\t]/g, '')
  const cleanKey = supabaseAnonKey.replace(/[\r\n\t]/g, '')

  return createBrowserClient(
    cleanUrl,
    cleanKey,
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