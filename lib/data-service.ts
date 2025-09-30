import { createClient } from './supabase'
import { encryptMemo, decryptMemo, encryptCategory, decryptCategory } from './encryption'

export interface Memo {
  id: number
  text: string
  category: string
  timestamp: string
  completed: boolean
  isEncrypted?: boolean
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
    const { data: { user } } = await supabase.auth.getUser()
    return user
  },

  async saveMemos(memos: Memo[]) {
    const user = await this.getCurrentUser()
    if (!user) throw new Error('ユーザーが認証されていません')

    const supabase = createClient()

    // 既存のメモを削除
    await supabase.from('memos').delete().eq('user_id', user.id)

    // 新しいメモを挿入（暗号化して保存）
    if (memos.length > 0) {
      const memoEntries = memos.map(memo => {
        // メモを暗号化
        const encryptedMemo = encryptMemo({...memo}, user.id)
        return {
          id: memo.id,
          text: encryptedMemo.text,
          category: memo.category,
          timestamp: memo.timestamp,
          completed: memo.completed,
          user_id: user.id,
          is_encrypted: true
        }
      })

      const { error } = await supabase.from('memos').insert(memoEntries)
      if (error) throw error
    }
  },

  async loadMemos(): Promise<Memo[]> {
    const user = await this.getCurrentUser()
    if (!user) return []

    const supabase = createClient()
    const { data, error } = await supabase
      .from('memos')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    // メモを復号化して返す
    return data?.map(item => {
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
        const decrypted = decryptMemo({...memo}, user.id)
        return {
          ...memo,
          text: decrypted.text,
          isEncrypted: false
        }
      }

      return memo
    }) || []
  },

  async saveCategories(categories: { [key: string]: Category }, categoryOrder: string[]) {
    const user = await this.getCurrentUser()
    if (!user) throw new Error('ユーザーが認証されていません')

    const supabase = createClient()

    // 既存のカテゴリを削除
    await supabase.from('categories').delete().eq('user_id', user.id)

    // 新しいカテゴリを挿入（暗号化して保存）
    const categoryEntries = Object.entries(categories).map(([id, cat], index) => {
      // カテゴリ名を暗号化
      const encryptedCat = encryptCategory({...cat}, user.id)
      return {
        id,
        name: encryptedCat.name,
        icon: cat.icon,
        color: cat.color,
        order_index: categoryOrder.indexOf(id) !== -1 ? categoryOrder.indexOf(id) : index,
        user_id: user.id,
        is_encrypted: true
      }
    })

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
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .order('order_index')

    if (error) throw error

    const categories: { [key: string]: Category } = {}
    const categoryOrder: string[] = []

    data?.forEach(cat => {
      let category: Category = {
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        isEncrypted: cat.is_encrypted
      }

      // 暗号化されている場合は復号
      if (cat.is_encrypted) {
        const decrypted = decryptCategory({...category}, user.id)
        category = {
          ...category,
          name: decrypted.name,
          isEncrypted: false
        }
      }

      categories[cat.id] = category
      categoryOrder.push(cat.id)
    })

    return { categories, categoryOrder }
  },

  async saveMemoOrder(memoOrder: number[]) {
    const user = await this.getCurrentUser()
    if (!user) throw new Error('ユーザーが認証されていません')

    const supabase = createClient()
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
    const { data, error } = await supabase
      .from('memo_orders')
      .select('memo_order')
      .eq('user_id', user.id)
      .single()

    if (error) return []
    return data?.memo_order || []
  }
}