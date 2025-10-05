import { createClient } from './supabase'
import { encryptMemo, decryptMemo, encryptCategory, decryptCategory } from './encryption'

export interface Memo {
  id: number
  text: string
  category: string
  timestamp: string
  completed: boolean
  isEncrypted?: boolean
  updated_at?: string  // 更新時刻
  deleted?: boolean    // 削除フラグ
}

export interface Category {
  name: string
  icon: string
  color: string
  isEncrypted?: boolean
}

export const dataService = {
  async getCurrentUser() {
    const supabase = createClient()
    if (!supabase) return null

    try {
      const { data: { user }, error } = await supabase.auth.getUser()

      // リフレッシュトークンエラーの場合はセッションをクリア
      if (error && error.message.includes('Refresh Token')) {
        console.log('期限切れセッションを検出、クリアします')
        await supabase.auth.signOut()
        return null
      }

      return user
    } catch (error) {
      console.error('ユーザー取得エラー:', error)
      return null
    }
  },

  async saveMemos(memos: Memo[]) {
    // テスト用: 認証チェックを一時的に無効化
    const user = await this.getCurrentUser()
    if (!user) {
      console.log('認証なしでテスト保存を実行')
      // ダミーユーザーIDでテスト
      const testUserId = 'test-user-123'
      return this.saveMemosWithUserId(memos, testUserId)
    }

    const supabase = createClient()
    if (!supabase) return

    // 既存のメモを削除
    console.log('既存のメモを削除中...')
    const { error: deleteError } = await supabase.from('memos').delete().eq('user_id', user.id)
    if (deleteError) {
      console.error('削除エラー:', deleteError)
      throw deleteError
    }

    // 新しいメモを挿入（暗号化して保存）
    if (memos.length > 0) {
      console.log(`保存するメモ数: ${memos.length}`)

      // バッチサイズを20に設定（大量データ対応）
      const batchSize = 20
      for (let i = 0; i < memos.length; i += batchSize) {
        const batch = memos.slice(i, i + batchSize)

        const memoEntries = await Promise.all(batch.map(async memo => {
          // 暗号化を一時的に無効化
          // const encryptedMemo = await encryptMemo({...memo}, user.id)
          return {
            id: memo.id,
            text: memo.text, // 暗号化なし
            category: memo.category,
            timestamp: memo.timestamp,
            completed: memo.completed,
            user_id: user.id,
            updated_at: memo.updated_at || new Date().toISOString(),
            deleted: memo.deleted || false
          }
        }))

        const { error } = await supabase.from('memos').insert(memoEntries)
        if (error) {
          console.error(`バッチ ${i / batchSize + 1} の保存エラー:`, error)
          throw error
        }
        console.log(`バッチ ${i / batchSize + 1} 完了: ${Math.min(i + batchSize, memos.length)}/${memos.length}`)
      }

      console.log('すべてのメモの保存が完了しました')
    }
  },

  async saveMemosWithUserId(memos: Memo[], userId: string) {
    const supabase = createClient()
    if (!supabase) return

    // 既存のメモを削除
    console.log('既存のメモを削除中...')
    const { error: deleteError } = await supabase.from('memos').delete().eq('user_id', userId)
    if (deleteError) {
      console.error('削除エラー:', deleteError)
      throw deleteError
    }

    // 新しいメモを挿入
    if (memos.length > 0) {
      console.log(`保存するメモ数: ${memos.length}`)

      const batchSize = 20
      for (let i = 0; i < memos.length; i += batchSize) {
        const batch = memos.slice(i, i + batchSize)

        const memoEntries = await Promise.all(batch.map(async memo => {
          return {
            id: memo.id,
            text: memo.text,
            category: memo.category,
            timestamp: memo.timestamp,
            completed: memo.completed,
            user_id: userId,
            updated_at: memo.updated_at || new Date().toISOString(),
            deleted: memo.deleted || false
          }
        }))

        const { error } = await supabase.from('memos').insert(memoEntries)
        if (error) {
          console.error(`バッチ ${i / batchSize + 1} の保存エラー:`, error)
          throw error
        }
        console.log(`バッチ ${i / batchSize + 1} 完了: ${Math.min(i + batchSize, memos.length)}/${memos.length}`)
      }
      console.log('すべてのメモの保存が完了しました')
    }
  },

  async loadMemos(): Promise<Memo[]> {
    const user = await this.getCurrentUser()
    if (!user) {
      console.log('認証なしでテストデータを読み込み')
      return this.loadMemosWithUserId('test-user-123')
    }

    const supabase = createClient()
    if (!supabase) return []

    console.log('Supabaseからメモを読み込み中...')
    const { data, error } = await supabase
      .from('memos')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1000)  // 最大1000件まで読み込み

    if (error) {
      console.error('メモの読み込みエラー:', error)
      throw error
    }

    console.log(`Supabaseから${data?.length || 0}件のメモを取得しました`)

    // メモを復号化して返す
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const memos = await Promise.all((data || []).map(async (item: any) => {
      const memo: Memo = {
        id: item.id,
        text: item.text,
        category: item.category,
        timestamp: item.timestamp,
        completed: item.completed,
        isEncrypted: item.is_encrypted
      }

      // 暗号化されている場合は復号
      if (item.is_encrypted) {
        const decrypted = await decryptMemo({...memo}, user.id)
        return {
          ...memo,
          text: decrypted.text,
          isEncrypted: false
        }
      }

      return memo
    }))

    return memos
  },

  async loadMemosWithUserId(userId: string): Promise<Memo[]> {
    const supabase = createClient()
    if (!supabase) return []

    console.log('Supabaseからメモを読み込み中...')
    const { data, error } = await supabase
      .from('memos')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1000)

    if (error) {
      console.error('メモの読み込みエラー:', error)
      throw error
    }

    console.log(`Supabaseから${data?.length || 0}件のメモを取得しました`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const memos = (data || []).map((item: any) => ({
      id: item.id,
      text: item.text,
      category: item.category,
      timestamp: item.timestamp,
      completed: item.completed,
      isEncrypted: item.is_encrypted
    }))

    return memos
  },

  async saveCategories(categories: { [key: string]: Category }, categoryOrder: string[]) {
    const user = await this.getCurrentUser()
    if (!user) throw new Error('ユーザーが認証されていません')

    const supabase = createClient()
    if (!supabase) return

    // 既存のカテゴリを削除
    await supabase.from('categories').delete().eq('user_id', user.id)

    // 新しいカテゴリを挿入（暗号化を無効化）
    const categoryEntries = await Promise.all(Object.entries(categories).map(async ([id, cat], index) => {
      // 暗号化を一時的に無効化
      // const encryptedCat = await encryptCategory({...cat}, user.id)
      return {
        id,
        name: cat.name, // 暗号化なし
        icon: cat.icon,
        color: cat.color,
        order_index: categoryOrder.indexOf(id) !== -1 ? categoryOrder.indexOf(id) : index,
        user_id: user.id
      }
    }))

    if (categoryEntries.length > 0) {
      const { error } = await supabase.from('categories').insert(categoryEntries)
      if (error) throw error
    }
  },

  async loadCategories(): Promise<{
    categories: { [key: string]: Category }
    categoryOrder: string[]
  }> {
    const user = await this.getCurrentUser()
    if (!user) return { categories: {}, categoryOrder: [] }

    const supabase = createClient()
    if (!supabase) return { categories: {}, categoryOrder: [] }
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .order('order_index')

    if (error) throw error

    const categories: { [key: string]: Category } = {}
    const categoryOrder: string[] = []

    for (const cat of data || []) {
      let category: Category = {
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        isEncrypted: cat.is_encrypted
      }

      // 暗号化されている場合は復号
      if (cat.is_encrypted) {
        const decrypted = await decryptCategory({...category}, user.id)
        category = {
          ...category,
          name: decrypted.name,
          isEncrypted: false
        }
      }

      categories[cat.id] = category
      categoryOrder.push(cat.id)
    }

    return { categories, categoryOrder }
  },

  async saveMemoOrder(memoOrder: number[]) {
    const user = await this.getCurrentUser()
    if (!user) throw new Error('ユーザーが認証されていません')

    const supabase = createClient()
    if (!supabase) return
    const { error } = await supabase
      .from('memo_orders')
      .upsert({
        user_id: user.id,
        memo_order: memoOrder,
        updated_at: new Date().toISOString()
      })

    if (error) throw error
  },

  async loadMemoOrder(): Promise<number[]> {
    const user = await this.getCurrentUser()
    if (!user) return []

    const supabase = createClient()
    if (!supabase) return []

    const { data, error } = await supabase
      .from('memo_orders')
      .select('memo_order')
      .eq('user_id', user.id)
      .single()

    if (error) return []
    return data?.memo_order || []
  }
}