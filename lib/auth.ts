import { createClient } from './supabase'

export const authService = {
  async signUp(email: string, password: string) {
    const supabase = createClient()
    return supabase.auth.signUp({
      email,
      password,
      options: {
        // メール確認後に自動的にログイン状態を維持
        emailRedirectTo: `${window.location.origin}/`,
      }
    })
  },

  async signIn(email: string, password: string) {
    const supabase = createClient()
    return supabase.auth.signInWithPassword({
      email,
      password,
    })
  },

  async signInWithGoogle() {
    const supabase = createClient()
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
    return supabase.auth.signOut()
  },

  async getUser() {
    const supabase = createClient()
    return supabase.auth.getUser()
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onAuthStateChange(callback: (user: any) => void) {
    const supabase = createClient()
    return supabase.auth.onAuthStateChange((event, session) => {
      callback(session?.user ?? null)
    })
  },

  // セッションリフレッシュ機能
  async refreshSession() {
    const supabase = createClient()
    return supabase.auth.refreshSession()
  },

  // セッション状態を確認
  async getSession() {
    const supabase = createClient()
    return supabase.auth.getSession()
  }
}