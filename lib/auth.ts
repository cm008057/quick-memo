import { createClient } from './supabase'

export const authService = {
  async signUp(email: string, password: string) {
    const supabase = createClient()
    if (!supabase) return { data: null, error: new Error('Supabase not configured') }
    return supabase.auth.signUp({
      email,
      password,
      options: {
        // メール確認後に自動的にログイン状態を維持
        emailRedirectTo: `${window.location.origin}/`,
        // メール確認なしで即座にログインを許可
        data: {
          email_confirm: false
        }
      }
    })
  },

  async signIn(email: string, password: string) {
    const supabase = createClient()
    if (!supabase) return { data: null, error: new Error('Supabase not configured') }
    return supabase.auth.signInWithPassword({
      email,
      password,
    })
  },

  async signInWithGoogle() {
    const supabase = createClient()
    if (!supabase) return { data: null, error: new Error('Supabase not configured') }
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
        // セッションを永続化
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      }
    })
  },

  async signOut() {
    const supabase = createClient()
    if (!supabase) return { error: null }
    return supabase.auth.signOut()
  },

  async getUser() {
    const supabase = createClient()
    if (!supabase) return { data: { user: null }, error: null }
    return supabase.auth.getUser()
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onAuthStateChange(callback: (user: any) => void) {
    const supabase = createClient()
    if (!supabase) {
      // Supabaseが設定されていない場合は即座にnullユーザーでコールバック
      setTimeout(() => callback(null), 0)
      return { data: { subscription: { unsubscribe: () => {} } } }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return supabase.auth.onAuthStateChange(async (event: any, session: any) => {
      // 重要なイベントのみログ出力
      if (event === 'SIGNED_IN') {
        console.log('🔐 ログイン完了')
      } else if (event === 'SIGNED_OUT') {
        console.log('🔓 ログアウト完了')
        // ローカルストレージをクリア
        if (typeof window !== 'undefined') {
          localStorage.removeItem('sb-' + supabase.supabaseUrl.split('//')[1] + '-auth-token')
        }
      }
      // TOKEN_REFRESHEDは頻繁すぎるのでログ出力なし

      callback(session?.user ?? null)
    })
  },

  // セッションリフレッシュ機能
  async refreshSession() {
    const supabase = createClient()
    if (!supabase) return { data: { session: null }, error: null }
    return supabase.auth.refreshSession()
  },

  // セッション状態を確認
  async getSession() {
    const supabase = createClient()
    if (!supabase) return { data: { session: null }, error: null }
    return supabase.auth.getSession()
  }
}