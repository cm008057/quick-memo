import CryptoJS from 'crypto-js'

/**
 * ユーザーIDから暗号化キーを生成
 * 各ユーザーは自分だけの暗号化キーを持つ
 */
export const generateEncryptionKey = (userId: string): string => {
  // ユーザーIDとアプリ固有のソルトを組み合わせてキーを生成
  const appSalt = process.env.NEXT_PUBLIC_APP_SALT || 'quick-memo-default-salt-2024'
  return CryptoJS.SHA256(userId + appSalt).toString()
}

/**
 * テキストを暗号化
 */
export const encryptText = (text: string, userId: string): string => {
  if (!text || !userId) return text

  try {
    const key = generateEncryptionKey(userId)
    const encrypted = CryptoJS.AES.encrypt(text, key).toString()
    return encrypted
  } catch (error) {
    console.error('暗号化エラー:', error)
    return text // エラー時は元のテキストを返す
  }
}

/**
 * 暗号化されたテキストを復号
 */
export const decryptText = (encryptedText: string, userId: string): string => {
  if (!encryptedText || !userId) return encryptedText

  try {
    const key = generateEncryptionKey(userId)
    const decrypted = CryptoJS.AES.decrypt(encryptedText, key)
    const originalText = decrypted.toString(CryptoJS.enc.Utf8)

    // 復号化に失敗した場合（暗号化されていないデータの場合）
    if (!originalText) {
      return encryptedText
    }

    return originalText
  } catch (error) {
    console.error('復号化エラー:', error)
    return encryptedText // エラー時は元のテキストを返す（暗号化されていない可能性）
  }
}

/**
 * データが暗号化されているかチェック
 */
export const isEncrypted = (text: string): boolean => {
  if (!text) return false

  // AES暗号化された文字列の特徴をチェック
  // 通常、Base64エンコードされた文字列で、特定のパターンを持つ
  try {
    // U2FsdGVkX1 はCryptoJS AESの暗号化プレフィックス
    return text.startsWith('U2FsdGVkX1')
  } catch {
    return false
  }
}

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
 * オブジェクトの特定フィールドを暗号化
 */
export const encryptMemo = (memo: MemoLike, userId: string): MemoLike => {
  if (!userId) return memo

  return {
    ...memo,
    text: encryptText(memo.text, userId),
    isEncrypted: true
  }
}

/**
 * オブジェクトの特定フィールドを復号
 */
export const decryptMemo = (memo: MemoLike, userId: string): MemoLike => {
  if (!userId || !memo.isEncrypted) return memo

  return {
    ...memo,
    text: decryptText(memo.text, userId),
    isEncrypted: false
  }
}

/**
 * カテゴリー名を暗号化
 */
export const encryptCategory = (category: CategoryLike, userId: string): CategoryLike => {
  if (!userId) return category

  return {
    ...category,
    name: encryptText(category.name, userId),
    isEncrypted: true
  }
}

/**
 * カテゴリー名を復号
 */
export const decryptCategory = (category: CategoryLike, userId: string): CategoryLike => {
  if (!userId) return category

  // 暗号化されていない場合はそのまま返す
  if (!category.isEncrypted) return category

  return {
    ...category,
    name: decryptText(category.name, userId),
    isEncrypted: false
  }
}