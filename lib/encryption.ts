interface MemoLike {
  text: string
  isEncrypted?: boolean
  [key: string]: unknown
}

interface CategoryLike {
  name: string
  isEncrypted?: boolean
  [key: string]: unknown
}

// 暗号化を一時的に無効化（デバッグのため）
const ENCRYPTION_ENABLED = false

/**
 * ユーザーIDから暗号化キーを生成
 * 各ユーザーは自分だけの暗号化キーを持つ
 */
export const generateEncryptionKey = async (userId: string): Promise<string> => {
  if (!ENCRYPTION_ENABLED) return userId

  // サーバーサイドではスキップ
  if (typeof window === 'undefined') {
    return userId
  }

  try {
    const CryptoJS = (await import('crypto-js')).default
    const appSalt = process.env.NEXT_PUBLIC_APP_SALT || 'quick-memo-default-salt-2024'
    return CryptoJS.SHA256(userId + appSalt).toString()
  } catch (error) {
    console.error('Failed to generate encryption key:', error)
    return userId
  }
}

/**
 * テキストを暗号化
 */
export const encryptText = async (text: string, userId: string): Promise<string> => {
  if (!ENCRYPTION_ENABLED) return text

  if (!text || !userId) return text

  // サーバーサイドではスキップ
  if (typeof window === 'undefined') {
    return text
  }

  try {
    const CryptoJS = (await import('crypto-js')).default
    const key = await generateEncryptionKey(userId)
    const encrypted = CryptoJS.AES.encrypt(text, key).toString()
    return encrypted
  } catch (error) {
    console.error('暗号化エラー:', error)
    return text
  }
}

/**
 * 暗号化されたテキストを復号
 */
export const decryptText = async (encryptedText: string, userId: string): Promise<string> => {
  if (!ENCRYPTION_ENABLED) return encryptedText

  if (!encryptedText || !userId) return encryptedText

  // サーバーサイドではスキップ
  if (typeof window === 'undefined') {
    return encryptedText
  }

  try {
    const CryptoJS = (await import('crypto-js')).default
    const key = await generateEncryptionKey(userId)
    const decrypted = CryptoJS.AES.decrypt(encryptedText, key)
    const originalText = decrypted.toString(CryptoJS.enc.Utf8)

    if (!originalText) {
      return encryptedText
    }

    return originalText
  } catch (error) {
    console.error('復号化エラー:', error)
    return encryptedText
  }
}

/**
 * データが暗号化されているかチェック
 */
export const isEncrypted = (text: string): boolean => {
  if (!ENCRYPTION_ENABLED) return false

  if (!text) return false

  try {
    // U2FsdGVkX1 はCryptoJS AESの暗号化プレフィックス
    return text.startsWith('U2FsdGVkX1')
  } catch {
    return false
  }
}

/**
 * オブジェクトの特定フィールドを暗号化
 */
export const encryptMemo = async (memo: MemoLike, userId: string): Promise<MemoLike> => {
  if (!ENCRYPTION_ENABLED) return memo

  if (!userId) return memo

  // サーバーサイドではスキップ
  if (typeof window === 'undefined') {
    return memo
  }

  try {
    return {
      ...memo,
      text: await encryptText(memo.text, userId),
      isEncrypted: true
    }
  } catch (error) {
    console.error('Memo encryption failed:', error)
    return memo
  }
}

/**
 * オブジェクトの特定フィールドを復号
 */
export const decryptMemo = async (memo: MemoLike, userId: string): Promise<MemoLike> => {
  if (!ENCRYPTION_ENABLED) return memo

  if (!userId || !memo.isEncrypted) return memo

  // サーバーサイドではスキップ
  if (typeof window === 'undefined') {
    return memo
  }

  try {
    return {
      ...memo,
      text: await decryptText(memo.text, userId),
      isEncrypted: false
    }
  } catch (error) {
    console.error('Memo decryption failed:', error)
    return memo
  }
}

/**
 * カテゴリー名を暗号化
 */
export const encryptCategory = async (category: CategoryLike, userId: string): Promise<CategoryLike> => {
  if (!ENCRYPTION_ENABLED) return category

  if (!userId) return category

  // サーバーサイドではスキップ
  if (typeof window === 'undefined') {
    return category
  }

  try {
    return {
      ...category,
      name: await encryptText(category.name, userId),
      isEncrypted: true
    }
  } catch (error) {
    console.error('Category encryption failed:', error)
    return category
  }
}

/**
 * カテゴリー名を復号
 */
export const decryptCategory = async (category: CategoryLike, userId: string): Promise<CategoryLike> => {
  if (!ENCRYPTION_ENABLED) return category

  if (!userId) return category

  // 暗号化されていない場合はそのまま返す
  if (!category.isEncrypted) return category

  // サーバーサイドではスキップ
  if (typeof window === 'undefined') {
    return category
  }

  try {
    return {
      ...category,
      name: await decryptText(category.name, userId),
      isEncrypted: false
    }
  } catch (error) {
    console.error('Category decryption failed:', error)
    return category
  }
}