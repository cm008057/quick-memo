import { createClient } from './supabase'

// 単一のメモを物理削除する専用関数（確実性重視）
export async function hardDeleteMemo(memoId: number, userId: string) {
  const supabase = createClient()
  if (!supabase) {
    throw new Error('Supabase client not available')
  }

  console.log(`🗑️ 物理削除を実行: ID=${memoId}, User=${userId}`)

  // データベースから完全に削除
  const { data, error } = await supabase
    .from('memos')
    .delete()
    .eq('id', memoId)
    .eq('user_id', userId)
    .select()

  if (error) {
    console.error('❌ 物理削除エラー:', error)
    throw error
  }

  console.log('✅ 物理削除成功:', data)
  return data
}