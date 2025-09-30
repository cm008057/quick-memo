import { createClient } from './supabase'

export interface LocalStorageData {
  memos: Array<{
    id: number
    text: string
    category: string
    timestamp: string
    completed: boolean
  }>
  categories: { [key: string]: { name: string; icon: string; color: string } }
  categoryOrder: string[]
  memoOrder: number[]
}

export const migrateFromLocalStorage = async (): Promise<{
  success: boolean
  message: string
  data?: LocalStorageData
}> => {
  try {
    const supabase = createClient()

    // LocalStorageからデータを取得
    const storedMemos = localStorage.getItem('quickMemos')
    const storedCategories = localStorage.getItem('categories')
    const storedCategoryOrder = localStorage.getItem('categoryOrder')
    const storedMemoOrder = localStorage.getItem('memoOrder')

    if (!storedMemos && !storedCategories) {
      return {
        success: false,
        message: 'LocalStorageにデータが見つかりません'
      }
    }

    const memos = storedMemos ? JSON.parse(storedMemos) : []
    const categories = storedCategories ? JSON.parse(storedCategories) : {}
    const categoryOrder = storedCategoryOrder ? JSON.parse(storedCategoryOrder) : []
    const memoOrder = storedMemoOrder ? JSON.parse(storedMemoOrder) : []

    const userId = 'demo-user' // デモ用のユーザーID

    // カテゴリーをSupabaseに挿入
    const categoryEntries = Object.entries(categories).map(([id, cat], index) => ({
      id,
      name: (cat as { name: string; icon: string; color: string }).name,
      icon: (cat as { name: string; icon: string; color: string }).icon,
      color: (cat as { name: string; icon: string; color: string }).color,
      order_index: categoryOrder.indexOf(id) !== -1 ? categoryOrder.indexOf(id) : index,
      user_id: userId
    }))

    if (categoryEntries.length > 0) {
      const { error: categoryError } = await supabase
        .from('categories')
        .upsert(categoryEntries)

      if (categoryError) {
        console.error('Category migration error:', categoryError)
        return {
          success: false,
          message: `カテゴリーの移行に失敗しました: ${categoryError.message}`
        }
      }
    }

    // メモをSupabaseに挿入
    const memoEntries = memos.map((memo: { id: number; text: string; category: string; timestamp: string; completed: boolean }) => ({
      id: memo.id,
      text: memo.text,
      category: memo.category,
      timestamp: memo.timestamp,
      completed: memo.completed,
      user_id: userId
    }))

    if (memoEntries.length > 0) {
      const { error: memoError } = await supabase
        .from('memos')
        .upsert(memoEntries)

      if (memoError) {
        console.error('Memo migration error:', memoError)
        return {
          success: false,
          message: `メモの移行に失敗しました: ${memoError.message}`
        }
      }
    }

    // メモの順序をSupabaseに保存
    if (memoOrder.length > 0) {
      const { error } = await supabase
        .from('memo_orders')
        .upsert({
          user_id: userId,
          memo_order: memoOrder,
          updated_at: new Date().toISOString()
        })

      if (error) {
        console.error('Memo order migration error:', error)
        return {
          success: false,
          message: `メモ順序の移行に失敗しました: ${error.message}`
        }
      }
    }

    return {
      success: true,
      message: `移行完了: カテゴリー${categoryEntries.length}個、メモ${memoEntries.length}個`,
      data: { memos, categories, categoryOrder, memoOrder }
    }

  } catch (error) {
    console.error('Migration error:', error)
    return {
      success: false,
      message: `移行中にエラーが発生しました: ${(error as Error).message}`
    }
  }
}

export const loadFromSupabase = async (): Promise<{
  success: boolean
  message: string
  data?: LocalStorageData
}> => {
  try {
    const supabase = createClient()
    const userId = 'demo-user' // デモ用のユーザーID

    // Supabaseからデータを取得
    const [
      { data: memos, error: memosError },
      { data: categories, error: categoriesError },
      { data: memoOrders }
    ] = await Promise.all([
      supabase.from('memos').select('*').eq('user_id', userId),
      supabase.from('categories').select('*').eq('user_id', userId).order('order_index'),
      supabase.from('memo_orders').select('*').eq('user_id', userId).single()
    ])

    if (memosError) {
      console.error('Memos fetch error:', memosError)
      return { success: false, message: `メモの取得に失敗しました: ${memosError.message}` }
    }

    if (categoriesError) {
      console.error('Categories fetch error:', categoriesError)
      return { success: false, message: `カテゴリーの取得に失敗しました: ${categoriesError.message}` }
    }

    // データを整形
    const formattedCategories: { [key: string]: { name: string; icon: string; color: string } } = {}
    const categoryOrder: string[] = []

    categories?.forEach(cat => {
      formattedCategories[cat.id] = {
        name: cat.name,
        icon: cat.icon,
        color: cat.color
      }
      categoryOrder.push(cat.id)
    })

    const formattedMemos = memos?.map(memo => ({
      id: memo.id,
      text: memo.text,
      category: memo.category,
      timestamp: memo.timestamp,
      completed: memo.completed
    })) || []

    const memoOrder = memoOrders?.memo_order || []

    return {
      success: true,
      message: `データ読み込み完了: カテゴリー${categories?.length || 0}個、メモ${memos?.length || 0}個`,
      data: {
        memos: formattedMemos,
        categories: formattedCategories,
        categoryOrder,
        memoOrder
      }
    }

  } catch (error) {
    console.error('Load error:', error)
    return {
      success: false,
      message: `データ読み込み中にエラーが発生しました: ${(error as Error).message}`
    }
  }
}