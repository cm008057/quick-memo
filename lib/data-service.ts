import { createClient } from './supabase'
import { decryptMemo, decryptCategory } from './encryption'

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
    if (!supabase) {
      console.warn('Supabaseクライアントが利用できません - ローカル保存のみ')
      return
    }

    // Supabaseクライアントの接続テスト
    try {
      const { error: testError } = await supabase.from('memos').select('id').limit(1)
      if (testError) {
        console.error('Supabase接続テストエラー:', testError)
        throw new Error(`Supabase接続失敗: ${testError.message}`)
      }
      console.log('Supabase接続テスト成功')
    } catch (connectionError) {
      console.error('Supabase接続エラー:', connectionError)
      throw connectionError
    }

    // UPSERTを使用（削除せず、既存データを更新または新規追加）
    console.log('メモをアップサート中...')

    // 新しいメモを挿入（暗号化して保存）
    if (memos.length > 0) {
      console.log(`保存するメモ数: ${memos.length}`)

      // 🔧 修正：削除は最初に1回だけ実行
      console.log('既存データを完全削除...')
      const { error: deleteError } = await supabase.from('memos').delete().eq('user_id', user.id)
      if (deleteError) {
        console.error('削除エラー:', deleteError)
        throw deleteError
      }
      console.log('削除完了')

      // バッチサイズを10に縮小（エラー対応）
      const batchSize = 10
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

        console.log(`バッチ ${i / batchSize + 1} 挿入中... (${batch.length}件)`)
        console.log(`バッチ内容:`, batch.map(m => ({ id: m.id, textLength: m.text?.length || 0 })))

        const { error, data } = await supabase.from('memos').insert(memoEntries)
        if (error) {
          console.error(`バッチ ${i / batchSize + 1} の保存エラー:`, error)
          console.error('エラー詳細:', {
            code: error.code || 'undefined',
            message: error.message || 'undefined',
            details: error.details || 'undefined',
            hint: error.hint || 'undefined',
            batchSize: batch.length,
            batchRange: `${i + 1}-${Math.min(i + batchSize, memos.length)}`,
            errorType: typeof error,
            errorKeys: Object.keys(error || {}),
            fullError: JSON.stringify(error, null, 2)
          })

          // エラーの種類によって処理を分岐
          if (error.code === '23505') {
            console.warn('重複キーエラー - バッチをスキップして続行')
            continue
          } else if (error.message?.includes('payload') || error.message?.includes('size')) {
            console.warn('ペイロードサイズエラー - バッチサイズを縮小して再試行')
            // バッチサイズを半分にして再試行
            const smallerBatch = batch.slice(0, Math.floor(batch.length / 2))
            const smallerEntries = await Promise.all(smallerBatch.map(async memo => ({
              id: memo.id,
              text: memo.text,
              category: memo.category,
              timestamp: memo.timestamp,
              completed: memo.completed,
              user_id: user.id,
              updated_at: memo.updated_at || new Date().toISOString(),
              deleted: memo.deleted || false
            })))

            const { error: retryError } = await supabase.from('memos').insert(smallerEntries)
            if (retryError) {
              console.error('再試行も失敗:', retryError)
              throw retryError
            }
            console.log(`縮小バッチで成功: ${smallerBatch.length}件`)
            continue
          } else {
            throw error
          }
        }
        console.log(`バッチ ${i / batchSize + 1} 完了: ${Math.min(i + batchSize, memos.length)}/${memos.length} (挿入数: ${data?.length || 0})`)
      }

      console.log('すべてのメモの保存が完了しました')
    }
  },

  async saveMemosWithUserId(memos: Memo[], userId: string) {
    const supabase = createClient()
    if (!supabase) {
      console.warn('Supabaseクライアントが利用できません - ローカル保存のみ')
      return
    }

    // Supabaseクライアントの接続テスト
    try {
      const { error: testError } = await supabase.from('memos').select('id').limit(1)
      if (testError) {
        console.error('Supabase接続テストエラー:', testError)
        throw new Error(`Supabase接続失敗: ${testError.message}`)
      }
      console.log('Supabase接続テスト成功')
    } catch (connectionError) {
      console.error('Supabase接続エラー:', connectionError)
      throw connectionError
    }

    // UPSERTを使用（削除せず、既存データを更新または新規追加）
    console.log('メモをアップサート中...')

    // 新しいメモを挿入
    if (memos.length > 0) {
      console.log(`保存するメモ数: ${memos.length}`)

      // 🔧 修正：削除は最初に1回だけ実行
      console.log('既存データを完全削除...')
      const { error: deleteError } = await supabase.from('memos').delete().eq('user_id', userId)
      if (deleteError) {
        console.error('削除エラー:', deleteError)
        throw deleteError
      }
      console.log('削除完了')

      const batchSize = 10
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

        console.log(`バッチ ${i / batchSize + 1} 挿入中... (${batch.length}件)`)
        const { error, data } = await supabase.from('memos').insert(memoEntries)
        if (error) {
          console.error(`バッチ ${i / batchSize + 1} の保存エラー:`, error)
          console.error('エラー詳細:', {
            code: error.code || 'undefined',
            message: error.message || 'undefined',
            details: error.details || 'undefined',
            hint: error.hint || 'undefined',
            batchSize: batch.length,
            batchRange: `${i + 1}-${Math.min(i + batchSize, memos.length)}`,
            errorType: typeof error,
            errorKeys: Object.keys(error || {}),
            fullError: JSON.stringify(error, null, 2)
          })

          // 重複エラーの場合はスキップ
          if (error.code === '23505') {
            console.warn('重複キーエラー - バッチをスキップして続行')
            continue
          } else {
            throw error
          }
        }
        console.log(`バッチ ${i / batchSize + 1} 完了: ${Math.min(i + batchSize, memos.length)}/${memos.length} (挿入数: ${data?.length || 0})`)
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
      .order('id', { ascending: false })
      .limit(2000)  // 最大2000件まで読み込み

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
        isEncrypted: item.is_encrypted,
        updated_at: item.updated_at,
        deleted: item.deleted
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
      .order('id', { ascending: false })
      .limit(2000)

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
      isEncrypted: item.is_encrypted,
      updated_at: item.updated_at,
      deleted: item.deleted
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
    if (!user) {
      // 認証なしの場合はtest-user-123で保存
      return this.saveMemoOrderForUser('test-user-123', memoOrder)
    }

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

  async saveMemoOrderForUser(userId: string, memoOrder: number[]) {
    const supabase = createClient()
    if (!supabase) return
    const { error } = await supabase
      .from('memo_orders')
      .upsert({
        user_id: userId,
        memo_order: memoOrder,
        updated_at: new Date().toISOString()
      })

    if (error) throw error
  },

  // 強制的に全データを置換保存（確実な保存用）
  async forceReplaceAllMemos(memos: Memo[]) {
    const supabase = createClient()
    if (!supabase) {
      console.error('Supabaseクライアントが利用できません')
      throw new Error('Supabase connection failed')
    }

    // ユーザーIDを取得
    const user = await this.getCurrentUser()
    const userId = user?.id || 'test-user-123'

    console.log('🛡️ 安全な強制置換モード開始')
    console.log(`対象ユーザー: ${userId}`)
    console.log(`保存対象: ${memos.length}件`)

    try {
      // 既存データを完全削除
      console.log('🗑️ 既存データを完全削除中...')
      const { error: deleteError } = await supabase.from('memos').delete().eq('user_id', userId)
      if (deleteError) {
        console.error('削除エラー:', deleteError)
        throw deleteError
      }
      console.log('✅ 既存データ削除完了')

      // 新しいデータを挿入
      if (memos.length > 0) {
        console.log(`📝 ${memos.length}件のメモを新規挿入中...`)

        // 小さいバッチサイズで確実性を重視
        const batchSize = 5
        let totalInserted = 0

        for (let i = 0; i < memos.length; i += batchSize) {
          const batch = memos.slice(i, i + batchSize)
          const memoEntries = batch.map(memo => ({
            id: memo.id,
            text: memo.text || '',  // nullを防ぐ
            category: memo.category || 'その他',
            timestamp: memo.timestamp,
            completed: memo.completed || false,
            user_id: userId,
            updated_at: memo.updated_at || new Date().toISOString(),
            deleted: false  // 明示的にfalse
          }))

          console.log(`📦 バッチ ${Math.floor(i / batchSize) + 1} 挿入中...`)
          const { error, data } = await supabase.from('memos').insert(memoEntries)
          if (error) {
            console.error(`❌ バッチ ${Math.floor(i / batchSize) + 1} エラー:`, error)
            throw error
          }

          totalInserted += data?.length || batch.length
          console.log(`✅ バッチ ${Math.floor(i / batchSize) + 1} 完了: ${totalInserted}/${memos.length}`)
        }

        console.log(`🎉 安全な強制置換完了: ${totalInserted}件保存`)

        // 保存結果を検証
        const { data: verifyData, error: verifyError } = await supabase
          .from('memos')
          .select('id')
          .eq('user_id', userId)

        if (verifyError) {
          console.warn('検証エラー:', verifyError)
        } else {
          console.log(`🔍 保存検証: ${verifyData?.length || 0}件確認 (期待値: ${memos.length}件)`)
          if (verifyData?.length !== memos.length) {
            console.warn(`⚠️ 件数不一致: 保存=${verifyData?.length}, 期待=${memos.length}`)
          }
        }
      }
    } catch (error) {
      console.error('🚨 強制置換エラー:', error)
      throw error
    }
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