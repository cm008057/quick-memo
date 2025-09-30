import { createClient } from './supabase'

export interface Memo {
  id: number
  text: string
  category: string
  timestamp: string
  completed: boolean
}

export interface Category {
  name: string
  icon: string
  color: string
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

    // 新しいメモを挿入
    if (memos.length > 0) {
      const memoEntries = memos.map(memo => ({
        id: memo.id,
        text: memo.text,
        category: memo.category,
        timestamp: memo.timestamp,
        completed: memo.completed,
        user_id: user.id
      }))

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

    return data?.map(item => ({
      id: item.id,
      text: item.text,
      category: item.category,
      timestamp: item.timestamp,
      completed: item.completed
    })) || []
  },

  async saveCategories(categories: { [key: string]: Category }, categoryOrder: string[]) {
    const user = await this.getCurrentUser()
    if (!user) throw new Error('ユーザーが認証されていません')

    const supabase = createClient()

    // 既存のカテゴリを削除
    await supabase.from('categories').delete().eq('user_id', user.id)

    // 新しいカテゴリを挿入
    const categoryEntries = Object.entries(categories).map(([id, cat], index) => ({
      id,
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      order_index: categoryOrder.indexOf(id) !== -1 ? categoryOrder.indexOf(id) : index,
      user_id: user.id
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
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .order('order_index')

    if (error) throw error

    const categories: { [key: string]: Category } = {}
    const categoryOrder: string[] = []

    data?.forEach(cat => {
      categories[cat.id] = {
        name: cat.name,
        icon: cat.icon,
        color: cat.color
      }
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