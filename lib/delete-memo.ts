import { createClient } from './supabase'

// 単一のメモをソフト削除する専用関数
export async function softDeleteMemo(memoId: number, userId: string) {
  const supabase = createClient()
  if (!supabase) {
    throw new Error('Supabase client not available')
  }

  console.log(`ソフト削除を実行: ID=${memoId}`)

  // deletedフラグとupdated_atを更新
  const { data, error } = await supabase
    .from('memos')
    .update({
      deleted: true,
      updated_at: new Date().toISOString()
    })
    .eq('id', memoId)
    .eq('user_id', userId)
    .select()

  if (error) {
    console.error('ソフト削除エラー:', error)
    throw error
  }

  console.log('ソフト削除成功:', data)
  return data
}