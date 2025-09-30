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

/**
 * ユーザーIDから暗号化キーを生成
 * 各ユーザーは自分だけの暗号化キーを持つ
 */
export const generateEncryptionKey = async (userId: string): Promise<string> => {
  // サーバーサイドではスキップ
  if (typeof window === 'undefined') {
    return userId
  }

  const CryptoJS = (await import('crypto-js')).default
  const appSalt = process.env.NEXT_PUBLIC_APP_SALT || 'quick-memo-default-salt-2024'
  return CryptoJS.SHA256(userId + appSalt).toString()
}

/**
 * テキストを暗号化
 */
export const encryptText = async (text: string, userId: string): Promise<string> => {
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
  if (!userId) return memo

  // サーバーサイドではスキップ
  if (typeof window === 'undefined') {
    return memo
  }

  return {
    ...memo,
    text: await encryptText(memo.text, userId),
    isEncrypted: true
  }
}

/**
 * オブジェクトの特定フィールドを復号
 */
export const decryptMemo = async (memo: MemoLike, userId: string): Promise<MemoLike> => {
  if (!userId || !memo.isEncrypted) return memo

  // サーバーサイドではスキップ
  if (typeof window === 'undefined') {
    return memo
  }

  return {
    ...memo,
    text: await decryptText(memo.text, userId),
    isEncrypted: false
  }
}

/**
 * カテゴリー名を暗号化
 */
export const encryptCategory = async (category: CategoryLike, userId: string): Promise<CategoryLike> => {
  if (!userId) return category

  // サーバーサイドではスキップ
  if (typeof window === 'undefined') {
    return category
  }

  return {
    ...category,
    name: await encryptText(category.name, userId),
    isEncrypted: true
  }
}

/**
 * カテゴリー名を復号
 */
export const decryptCategory = async (category: CategoryLike, userId: string): Promise<CategoryLike> => {
  if (!userId) return category

  // 暗号化されていない場合はそのまま返す
  if (!category.isEncrypted) return category

  // サーバーサイドではスキップ
  if (typeof window === 'undefined') {
    return category
  }

  return {
    ...category,
    name: await decryptText(category.name, userId),
    isEncrypted: false
  }
}