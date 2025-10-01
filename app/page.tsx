'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import AuthModal from '@/components/AuthModal'
import { authService } from '@/lib/auth'
import { dataService } from '@/lib/data-service'
import './memo-styles.css'

// 型定義
interface Category {
  name: string
  icon: string
  color: string
}

// 音声認識の型定義
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any
  }
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionResultList {
  length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
}

interface Memo {
  id: number
  text: string
  category: string
  timestamp: string
  completed: boolean
  isEncrypted?: boolean
}

// デフォルトカテゴリー
const defaultCategories: { [key: string]: Category } = {
  goal: { name: '目指す姿', icon: '🎯', color: '#f43f5e' },
  challenge: { name: '課題', icon: '❗', color: '#ef4444' },
  idea: { name: 'アイデア', icon: '💡', color: '#fbbf24' },
  homework: { name: '宿題', icon: '📚', color: '#8b5cf6' },
  memo: { name: '備忘録', icon: '📄', color: '#10b981' },
  inspiration: { name: 'インスピレーション', icon: '✨', color: '#06b6d4' },
  freememo: { name: '自由メモ', icon: '📝', color: '#fb923c' }
}

// 利用可能なアイコンと色
const availableIcons = ['💡', '💬', '📄', '📅', '📚', '🙏', '⭐', '❗', '✅', '🎯', '🔔', '📌', '🏷️', '💰', '🏠', '🚗', '✈️', '🍴', '💊', '🎉', '✨', '📝']
const availableColors = ['#fbbf24', '#3b82f6', '#10b981', '#f43f5e', '#8b5cf6', '#fb923c', '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6366f1', '#14b8a6']

export default function QuickMemoApp() {
  const [categories, setCategories] = useState<{ [key: string]: Category }>(defaultCategories)
  const [categoryOrder, setCategoryOrder] = useState<string[]>([])
  const [memos, setMemos] = useState<Memo[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [currentFilter, setCurrentFilter] = useState<string>('all')
  const [currentSort, setCurrentSort] = useState<string>('manual')
  const [showCompleted, setShowCompleted] = useState<boolean>(true)
  const [memoOrder, setMemoOrder] = useState<number[]>([])
  const [memoInput, setMemoInput] = useState<string>('')
  const [showCategoryModal, setShowCategoryModal] = useState<boolean>(false)
  const [newCategoryName, setNewCategoryName] = useState<string>('')
  const [isListening, setIsListening] = useState<boolean>(false)
  const [showIconPicker, setShowIconPicker] = useState<string | null>(null)
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null)
  const [editingMemo, setEditingMemo] = useState<number | null>(null)
  const [editText, setEditText] = useState<string>('')
  const [showCategoryMenu, setShowCategoryMenu] = useState<number | null>(null)

  // 認証関連のstate
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [user, setUser] = useState<any>(null)
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [hasLocalData, setHasLocalData] = useState<boolean>(false)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  // カテゴリーの順序を取得
  const getOrderedCategories = (): [string, Category][] => {
    const ordered: [string, Category][] = []

    categoryOrder.forEach(key => {
      if (categories[key]) {
        ordered.push([key, categories[key]])
      }
    })

    Object.entries(categories).forEach(([key, cat]) => {
      if (!categoryOrder.includes(key)) {
        ordered.push([key, cat])
        setCategoryOrder(prev => [...prev, key])
      }
    })

    return ordered
  }

  // LocalStorageからデータを読み込み
  const loadDataFromLocalStorage = () => {
    const storedCategories = localStorage.getItem('categories')
    const storedCategoryOrder = localStorage.getItem('categoryOrder')
    const storedMemos = localStorage.getItem('quickMemos')
    const storedMemoOrder = localStorage.getItem('memoOrder')

    if (storedCategories) {
      setCategories(JSON.parse(storedCategories))
    }

    if (storedCategoryOrder) {
      setCategoryOrder(JSON.parse(storedCategoryOrder))
    } else {
      setCategoryOrder(Object.keys(defaultCategories))
    }

    if (storedMemos) {
      setMemos(JSON.parse(storedMemos))
    }

    if (storedMemoOrder) {
      setMemoOrder(JSON.parse(storedMemoOrder))
    }

    // 初期選択カテゴリーを設定
    setSelectedCategory(Object.keys(defaultCategories)[0])
  }

  // Supabaseからデータを読み込み
  const loadDataFromSupabase = useCallback(async () => {
    try {
      const { categories: dbCategories, categoryOrder: dbCategoryOrder } = await dataService.loadCategories()
      const dbMemos = await dataService.loadMemos()
      const dbMemoOrder = await dataService.loadMemoOrder()

      // 常にSupabaseデータを優先表示（デバッグ用）
      console.log('Supabaseからの読み込み結果:', {
        memos: dbMemos.length,
        categories: Object.keys(dbCategories).length,
        userAgent: navigator.userAgent
      })

      // データがあるかどうかに関わらず、Supabaseの結果を表示
      setCategories(Object.keys(dbCategories).length > 0 ? dbCategories : defaultCategories)
      setCategoryOrder(dbCategoryOrder.length > 0 ? dbCategoryOrder : Object.keys(defaultCategories))
      setMemos(dbMemos)
      setMemoOrder(dbMemoOrder)
      setSelectedCategory(Object.keys(dbCategories)[0] || Object.keys(defaultCategories)[0])
      console.log('データを設定しました:', dbMemos.length, '件のメモ')

      // ローカルデータチェックも実行
      checkForLocalData()

      // 自動移行を無効化（手動同期のみ）
      // await migrateLocalDataIfNeeded()
    } catch (error) {
      console.error('データの読み込みに失敗:', error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 認証状態の監視と初期化
  useEffect(() => {
    // 環境変数のデバッグ
    console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '設定済み' : '未設定')
    console.log('Supabase Key:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '設定済み' : '未設定')

    const { data: { subscription } } = authService.onAuthStateChange(async (user) => {
      console.log('Auth state changed:', user ? 'ログイン中' : '未ログイン')
      setUser(user)
      setIsLoading(false)

      // 認証状態に関わらず、常にSupabaseからデータを読み込み
      try {
        await loadDataFromSupabase()
        console.log('Supabaseからデータを読み込みました')
      } catch (error) {
        console.error('Supabaseデータの読み込みに失敗:', error)
        // フォールバック：LocalStorageからデータを読み込み
        loadDataFromLocalStorage()
        checkForLocalData()
      }
    })

    return () => subscription?.unsubscribe?.()
  }, [loadDataFromSupabase])

  // LocalStorageにデータがあるかチェック
  const checkForLocalData = () => {
    const hasData = localStorage.getItem('quickMemos') || localStorage.getItem('categories')
    setHasLocalData(!!hasData)
  }

  // クラウドに保存ボタンの処理
  const handleCloudSave = async () => {
    if (!user) {
      setShowAuthModal(true)
      return
    }

    try {
      console.log('クラウド保存を開始します...')

      // 現在のstateとLocalStorageの両方をチェックして同期
      await syncCurrentDataToSupabase()
      setHasLocalData(false)
      console.log('クラウド保存が完了しました')
      alert('データをクラウドに保存しました！')
    } catch (error) {
      console.error('クラウド保存エラー:', error)
      alert('保存に失敗しました: ' + (error as Error).message)
    }
  }

  // 現在のデータをSupabaseに同期
  const syncCurrentDataToSupabase = async () => {
    try {
      console.log('現在のデータをSupabaseに同期中...')
      console.log(`同期するメモ数: ${memos.length}`)

      // 現在表示中のメモを保存
      if (memos.length > 0) {
        await dataService.saveMemos(memos)
      }

      // 現在のカテゴリを保存
      await dataService.saveCategories(categories, categoryOrder)

      // メモの順序を保存
      if (memoOrder.length > 0) {
        await dataService.saveMemoOrder(memoOrder)
      }

      // LocalStorageもクリア（重複防止）
      localStorage.removeItem('quickMemos')
      localStorage.removeItem('categories')
      localStorage.removeItem('categoryOrder')
      localStorage.removeItem('memoOrder')

      console.log('同期完了')
    } catch (error) {
      console.error('同期エラー:', error)
      throw error
    }
  }

  // 自動同期機能（メモ変更時に呼び出し）
  const autoSync = async () => {
    try {
      await dataService.saveMemos(memos)
      console.log('自動同期完了:', memos.length, '件')
    } catch (error) {
      console.error('自動同期エラー:', error)
    }
  }

  // メモが変更されたときに自動同期
  useEffect(() => {
    if (memos.length > 0 && !isLoading) {
      // 初回読み込み時以外で自動同期
      const timer = setTimeout(() => {
        autoSync()
      }, 1000) // 1秒後に同期

      return () => clearTimeout(timer)
    }
  }, [memos, isLoading])

  // LocalStorageからSupabaseへの自動移行
  const migrateLocalDataIfNeeded = async () => {
    const storedMemos = localStorage.getItem('quickMemos')
    const storedCategories = localStorage.getItem('categories')

    if (storedMemos || storedCategories) {
      try {
        console.log('LocalStorageからSupabaseへ移行開始...')
        // LocalStorageのデータをSupabaseに保存
        if (storedMemos) {
          const localMemos = JSON.parse(storedMemos)
          console.log(`${localMemos.length}件のメモを移行します`)
          await dataService.saveMemos(localMemos)
        }

        if (storedCategories) {
          const localCategories = JSON.parse(storedCategories)
          const localCategoryOrder = JSON.parse(localStorage.getItem('categoryOrder') || '[]')
          await dataService.saveCategories(localCategories, localCategoryOrder)
        }

        const localMemoOrder = JSON.parse(localStorage.getItem('memoOrder') || '[]')
        if (localMemoOrder.length > 0) {
          await dataService.saveMemoOrder(localMemoOrder)
        }

        // 移行後、LocalStorageをクリア
        localStorage.removeItem('quickMemos')
        localStorage.removeItem('categories')
        localStorage.removeItem('categoryOrder')
        localStorage.removeItem('memoOrder')

        // データを再読み込み
        await loadDataFromSupabase()

        alert('LocalStorageのデータをクラウドに移行しました！')
      } catch (error) {
        console.error('データ移行に失敗:', error)
      }
    }
  }

  // 音声認識の初期化
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SpeechRecognitionConstructor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognitionConstructor()

      if (recognitionRef.current) {
        recognitionRef.current.continuous = false
        recognitionRef.current.interimResults = true
        recognitionRef.current.lang = 'ja-JP'

        recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = Array.from(event.results)
            .map(result => result[0].transcript)
            .join('')
          setMemoInput(transcript)
        }

        recognitionRef.current.onend = () => {
          setIsListening(false)
        }
      }
    }
  }, [])

  // データ保存（認証状態に応じて自動選択）
  const saveMemos = async () => {
    if (user) {
      try {
        await dataService.saveMemos(memos)
        await dataService.saveMemoOrder(memoOrder)
      } catch (error) {
        console.error('メモの保存に失敗:', error)
        // フォールバック：LocalStorageに保存
        localStorage.setItem('quickMemos', JSON.stringify(memos))
        localStorage.setItem('memoOrder', JSON.stringify(memoOrder))
      }
    } else {
      // 未ログイン：LocalStorageに保存
      localStorage.setItem('quickMemos', JSON.stringify(memos))
      localStorage.setItem('memoOrder', JSON.stringify(memoOrder))
    }
  }

  const saveCategories = async () => {
    if (user) {
      try {
        await dataService.saveCategories(categories, categoryOrder)
      } catch (error) {
        console.error('カテゴリの保存に失敗:', error)
        // フォールバック：LocalStorageに保存
        localStorage.setItem('categories', JSON.stringify(categories))
        localStorage.setItem('categoryOrder', JSON.stringify(categoryOrder))
      }
    } else {
      // 未ログイン：LocalStorageに保存
      localStorage.setItem('categories', JSON.stringify(categories))
      localStorage.setItem('categoryOrder', JSON.stringify(categoryOrder))
    }
  }

  // メモを追加
  const addMemo = () => {
    if (!memoInput.trim()) return

    const newMemo: Memo = {
      id: Date.now(),
      text: memoInput.trim(),
      category: selectedCategory,
      timestamp: new Date().toLocaleString('ja-JP'),
      completed: false
    }

    setMemos(prev => [newMemo, ...prev])
    setMemoOrder(prev => [newMemo.id, ...prev])
    setMemoInput('')
    saveMemos()
  }

  // 音声入力切り替え
  const toggleVoice = () => {
    if (!recognitionRef.current) {
      alert('お使いのブラウザは音声入力に対応していません。')
      return
    }

    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    } else {
      recognitionRef.current.start()
      setIsListening(true)
    }
  }

  // メモを編集
  const editMemo = (id: number) => {
    const memo = memos.find(m => m.id === id)
    if (memo) {
      setEditingMemo(id)
      setEditText(memo.text)
    }
  }

  const saveMemoEdit = (id: number) => {
    if (editText.trim()) {
      setMemos(prev => prev.map(m =>
        m.id === id ? { ...m, text: editText.trim() } : m
      ))
      saveMemos()
    }
    setEditingMemo(null)
    setEditText('')
  }

  const cancelMemoEdit = () => {
    setEditingMemo(null)
    setEditText('')
  }

  // メモを完了/未完了切り替え
  const toggleComplete = (id: number) => {
    setMemos(prev => prev.map(m =>
      m.id === id ? { ...m, completed: !m.completed } : m
    ))
    saveMemos()
  }

  // メモを削除
  const deleteMemo = (id: number) => {
    if (confirm('このメモを削除しますか？')) {
      setMemos(prev => prev.filter(m => m.id !== id))
      setMemoOrder(prev => prev.filter(mId => mId !== id))
      saveMemos()
    }
  }

  // カテゴリを移動
  const moveToCategory = (memoId: number, newCategory: string) => {
    setMemos(prev => prev.map(m =>
      m.id === memoId ? { ...m, category: newCategory } : m
    ))
    saveMemos()
    setShowCategoryMenu(null)
    showNotification(`メモを「${categories[newCategory]?.name}」に移動しました`)
  }

  // カテゴリにコピー
  const copyToCategory = (memoId: number, targetCategory: string) => {
    const originalMemo = memos.find(m => m.id === memoId)
    if (!originalMemo) return

    const newMemo: Memo = {
      id: Date.now(),
      text: originalMemo.text,
      category: targetCategory,
      completed: false,
      timestamp: new Date().toLocaleString('ja-JP')
    }

    setMemos(prev => [newMemo, ...prev])
    setMemoOrder(prev => [newMemo.id, ...prev])
    saveMemos()
    setShowCategoryMenu(null)
    showNotification(`メモを「${categories[targetCategory]?.name}」にコピーしました`)
  }

  // 通知を表示
  const showNotification = (message: string) => {
    // 簡単な通知実装
    alert(message)
  }

  // カテゴリを追加
  const addNewCategory = () => {
    if (!newCategoryName.trim()) return

    const key = 'custom_' + Date.now()
    const randomIcon = availableIcons[Math.floor(Math.random() * availableIcons.length)]
    const randomColor = availableColors[Math.floor(Math.random() * availableColors.length)]

    setCategories(prev => ({
      ...prev,
      [key]: {
        name: newCategoryName.trim(),
        icon: randomIcon,
        color: randomColor
      }
    }))

    setCategoryOrder(prev => [...prev, key])
    setNewCategoryName('')
    saveCategories()
  }

  // カテゴリを削除
  const deleteCategory = (key: string) => {
    const memosInCategory = memos.filter(m => m.category === key).length

    if (memosInCategory > 0) {
      alert('このカテゴリーにはメモがあるため削除できません。')
      return
    }

    if (confirm(`"${categories[key].name}" カテゴリーを削除しますか？`)) {
      const newCategories = { ...categories }
      delete newCategories[key]
      setCategories(newCategories)
      setCategoryOrder(prev => prev.filter(k => k !== key))

      if (selectedCategory === key) {
        setSelectedCategory(Object.keys(newCategories)[0])
      }

      if (currentFilter === key) {
        setCurrentFilter('all')
      }

      saveCategories()
    }
  }

  // カテゴリ名を更新
  const updateCategoryName = (key: string, newName: string) => {
    if (newName.trim()) {
      setCategories(prev => ({
        ...prev,
        [key]: { ...prev[key], name: newName.trim() }
      }))
      saveCategories()
    }
  }

  // メモをソート
  const sortMemos = (memoList: Memo[]): Memo[] => {
    const sorted = [...memoList]

    switch (currentSort) {
      case 'manual':
        return sorted.sort((a, b) => {
          const aIndex = memoOrder.indexOf(a.id)
          const bIndex = memoOrder.indexOf(b.id)

          if (aIndex === -1) return -1
          if (bIndex === -1) return 1

          return aIndex - bIndex
        })
      case 'newest':
        return sorted.sort((a, b) => b.id - a.id)
      case 'oldest':
        return sorted.sort((a, b) => a.id - b.id)
      case 'category':
        return sorted.sort((a, b) => {
          const aIndex = categoryOrder.indexOf(a.category)
          const bIndex = categoryOrder.indexOf(b.category)

          if (aIndex === -1) return 1
          if (bIndex === -1) return -1

          return aIndex - bIndex
        })
      default:
        return sorted
    }
  }

  // フィルタリングされたメモを取得
  const getFilteredMemos = (): Memo[] => {
    let filtered = currentFilter === 'all'
      ? memos
      : memos.filter(m => m.category === currentFilter)

    if (!showCompleted) {
      filtered = filtered.filter(m => !m.completed)
    }

    return sortMemos(filtered)
  }

  // カウントを取得
  const getCounts = () => {
    const countableMemos = showCompleted ? memos : memos.filter(m => !m.completed)

    const counts: { [key: string]: number } = {
      all: countableMemos.length
    }

    Object.keys(categories).forEach(key => {
      counts[key] = countableMemos.filter(m => m.category === key).length
    })

    return counts
  }

  // データをエクスポート
  const exportData = () => {
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      memos: memos,
      categories: categories,
      categoryOrder: categoryOrder,
      memoOrder: memoOrder,
      stats: {
        totalMemos: memos.length,
        completedMemos: memos.filter(m => m.completed).length,
        totalCategories: Object.keys(categories).length
      }
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `quick-memo-backup-${new Date().toLocaleDateString('ja-JP').replace(/\//g, '-')}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    alert(`データをエクスポートしました！\n\nメモ数: ${exportData.stats.totalMemos}\n完了済み: ${exportData.stats.completedMemos}\nカテゴリー数: ${exportData.stats.totalCategories}`)
  }

  // データをインポート
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async function(event) {
      try {
        const importData = JSON.parse(event.target?.result as string)

        if (!importData.memos || !importData.categories) {
          throw new Error('無効なバックアップファイルです')
        }

        const confirmMessage = `インポートしますか？\n\n` +
          `インポートするデータ:\n` +
          `- メモ数: ${importData.memos.length}\n` +
          `- カテゴリー数: ${Object.keys(importData.categories).length}\n\n` +
          `現在のデータ:\n` +
          `- メモ数: ${memos.length}\n` +
          `- カテゴリー数: ${Object.keys(categories).length}\n\n` +
          `※現在のデータは上書きされます`

        if (confirm(confirmMessage)) {
          setMemos(importData.memos || [])
          setCategories(importData.categories || {})
          setCategoryOrder(importData.categoryOrder || Object.keys(importData.categories))
          setMemoOrder(importData.memoOrder || importData.memos.map((m: Memo) => m.id))

          if (!importData.categories[selectedCategory]) {
            setSelectedCategory(Object.keys(importData.categories)[0])
          }

          // インポート後にLocalStorageに保存
          saveMemos()
          saveCategories()

          // Supabaseに直接保存（認証なしテスト）
          try {
            console.log(`${importData.memos.length}件のメモをSupabaseに保存中...`)
            await dataService.saveMemos(importData.memos)
            console.log('Supabaseへの保存完了')
            alert(`データをインポートしました！\n${importData.memos.length}件のデータをクラウドに保存完了`)
          } catch (error) {
            console.error('Supabase保存エラー:', error)
            alert(`データをインポートしました！\nローカルに保存済み（クラウド保存エラー: ${(error as Error).message}）`)
          }
        }
      } catch (error) {
        alert('インポートに失敗しました。\n\n' + (error as Error).message)
      }

      e.target.value = ''
    }

    reader.readAsText(file)
  }

  const filteredMemos = getFilteredMemos()
  const counts = getCounts()
  const orderedCategories = getOrderedCategories()

  // ローディング中の表示
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column',
        gap: '20px'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '3px solid #f3f3f3',
          borderTop: '3px solid #3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p style={{ color: '#666' }}>データを読み込み中...</p>
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div>
      <h1>クイックメモ 📝</h1>

      {/* ユーザー情報表示 */}
      {user && (
        <div style={{
          fontSize: '14px',
          color: '#666',
          marginBottom: '10px',
          textAlign: 'right'
        }}>
          ✅ {user.email} でログイン中（データはクラウドに自動保存されます）
        </div>
      )}

      <div className="input-area">
        <div className="category-section">
          <div className="category-header">
            <div className="category-buttons">
              {orderedCategories.map(([key, cat]) => (
                <button
                  key={key}
                  className={`category-btn ${key === selectedCategory ? 'active' : ''}`}
                  data-category={key}
                  style={{
                    backgroundColor: key === selectedCategory ? cat.color : '',
                    color: key === selectedCategory ? 'white' : ''
                  }}
                  onClick={() => setSelectedCategory(key)}
                >
                  {cat.icon} {cat.name}
                </button>
              ))}
            </div>
            <div className="category-actions">
              <button className="manage-btn" onClick={() => setShowCategoryModal(true)}>
                カテゴリー管理
              </button>
              {user ? (
                <>
                  <button
                    className="manage-btn"
                    onClick={async () => {
                      try {
                        console.log('手動でクラウド同期を開始...')
                        await saveMemos()
                        await saveCategories()
                        alert(`クラウドに保存しました！\n• ${memos.length}件のメモ\n• ${Object.keys(categories).length}個のカテゴリー`)
                      } catch (error) {
                        console.error('同期エラー:', error)
                        alert('同期に失敗しました: ' + (error as Error).message)
                      }
                    }}
                    title="クラウドに同期"
                  >
                    ☁️ 同期
                  </button>
                  <button
                    className="manage-btn"
                    onClick={async () => {
                      await authService.signOut()
                      alert('ログアウトしました')
                    }}
                    title="ログアウト"
                  >
                    👤 ログアウト
                  </button>
                </>
              ) : (
                <button
                  className="manage-btn"
                  onClick={() => setShowAuthModal(true)}
                  title="ログイン・アカウント作成"
                >
                  🔒 ログイン
                </button>
              )}
              <button className="export-btn" onClick={exportData} title="データをエクスポート">
                💾
              </button>
              <button className="import-btn" onClick={() => importInputRef.current?.click()} title="データをインポート">
                📂
              </button>
              <input
                type="file"
                ref={importInputRef}
                className="import-input"
                accept=".json"
                onChange={handleImport}
              />
            </div>
          </div>
        </div>

        <div className="input-row">
          <input
            type="text"
            value={memoInput}
            onChange={(e) => setMemoInput(e.target.value)}
            placeholder={`${categories[selectedCategory]?.name}を入力...`}
            onKeyPress={(e) => e.key === 'Enter' && addMemo()}
          />
          <button
            className={`voice-btn ${isListening ? 'listening' : ''}`}
            onClick={toggleVoice}
          >
            {isListening ? '🔴' : '🎤'}
          </button>
          <button className="add-btn" onClick={addMemo}>
            追加
          </button>
        </div>
      </div>

      <div className="controls">
        <div className="filter-tabs">
          <button
            className={`filter-tab ${currentFilter === 'all' ? 'active' : ''}`}
            onClick={() => setCurrentFilter('all')}
          >
            すべて <span>{counts.all}</span>
          </button>
          {orderedCategories.map(([key, cat]) => (
            <button
              key={key}
              className={`filter-tab ${currentFilter === key ? 'active' : ''}`}
              onClick={() => setCurrentFilter(key)}
            >
              {cat.name} <span>{counts[key] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="show-completed">
        <input
          type="checkbox"
          id="showCompleted"
          checked={showCompleted}
          onChange={(e) => setShowCompleted(e.target.checked)}
        />
        <label htmlFor="showCompleted">完了したメモも表示</label>
      </div>

      <div className="sort-wrapper">
        <label className="sort-label">並び順:</label>
        <select
          className="sort-select"
          value={currentSort}
          onChange={(e) => setCurrentSort(e.target.value)}
        >
          <option value="manual">手動並べ替え</option>
          <option value="newest">新しい順</option>
          <option value="oldest">古い順</option>
          <option value="category">カテゴリー順</option>
        </select>
      </div>

      <div id="memoList" style={{ width: '100%' }}>
        {filteredMemos.length === 0 ? (
          <div className="empty-state">メモがありません</div>
        ) : (
          filteredMemos.map((memo) => {
            const cat = categories[memo.category] || { name: '不明', icon: '❓', color: '#999' }
            const isManualSort = currentSort === 'manual'

            return (
              <div
                key={memo.id}
                className={`memo-item ${memo.completed ? 'completed' : ''} ${isManualSort ? 'manual-sort' : ''}`}
                data-memo-id={memo.id}
              >
                {isManualSort && (
                  <div className="drag-handle-area">
                    ≡
                  </div>
                )}
                <div className="memo-content">
                  <span
                    className="memo-category"
                    style={{ backgroundColor: cat.color }}
                  >
                    {cat.icon} {cat.name}
                  </span>
                  {editingMemo === memo.id ? (
                    <textarea
                      className="memo-edit-input"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={2}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          saveMemoEdit(memo.id)
                        } else if (e.key === 'Escape') {
                          cancelMemoEdit()
                        }
                      }}
                    />
                  ) : (
                    <p className="memo-text">{memo.text}</p>
                  )}
                  <div className="memo-date">📅 {memo.timestamp}</div>
                </div>
                <div className="memo-actions">
                  {editingMemo === memo.id ? (
                    <>
                      <button
                        className="action-btn save-btn"
                        onClick={() => saveMemoEdit(memo.id)}
                        title="保存"
                      >
                        💾
                      </button>
                      <button
                        className="action-btn cancel-btn"
                        onClick={cancelMemoEdit}
                        title="キャンセル"
                      >
                        ❌
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="action-btn edit-btn"
                        onClick={() => editMemo(memo.id)}
                        title="編集"
                      >
                        ✏️
                      </button>
                      <button
                        className="action-btn move-copy-btn"
                        onClick={() => setShowCategoryMenu(showCategoryMenu === memo.id ? null : memo.id)}
                        title="カテゴリ移動・コピー"
                      >
                        📁
                      </button>
                      <button
                        className={`action-btn complete-btn ${memo.completed ? 'completed' : ''}`}
                        onClick={() => toggleComplete(memo.id)}
                        title={memo.completed ? '未完了にする' : '完了にする'}
                      >
                        {memo.completed ? '✅' : '⭕'}
                      </button>
                      <button
                        className="action-btn delete-btn"
                        onClick={() => deleteMemo(memo.id)}
                        title="削除"
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </div>

                {showCategoryMenu === memo.id && (
                  <div className="category-menu show">
                    <div className="category-menu-header">📂 カテゴリを移動</div>
                    {orderedCategories.map(([key, cat]) => (
                      <div
                        key={key}
                        className={`category-menu-item ${key === memo.category ? 'current' : ''}`}
                        onClick={() => key !== memo.category && moveToCategory(memo.id, key)}
                      >
                        <span style={{ color: cat.color }}>{cat.icon}</span> {cat.name}
                      </div>
                    ))}
                    <div className="category-menu-header" style={{ marginTop: '10px' }}>📋 カテゴリにコピー</div>
                    {orderedCategories.map(([key, cat]) => (
                      key !== memo.category && (
                        <div
                          key={key}
                          className="category-menu-item"
                          onClick={() => copyToCategory(memo.id, key)}
                        >
                          <span style={{ color: cat.color }}>{cat.icon}</span> {cat.name}にコピー
                        </div>
                      )
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* 認証モーダル */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={async () => {
          setShowAuthModal(false)
          // 認証成功後に移行処理を実行
          if (hasLocalData) {
            try {
              await new Promise(resolve => setTimeout(resolve, 1000)) // 認証完了を待つ
              await migrateLocalDataIfNeeded()
              setHasLocalData(false)
              console.log('ログイン後の自動移行が完了しました')
            } catch (error) {
              console.error('自動移行エラー:', error)
            }
          }
        }}
      />

      {/* ローカルデータ移行提案モーダル */}
      {!user && hasLocalData && (
        <div className="modal active">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                データをクラウドに保存しませんか？
              </h3>
            </div>
            <div style={{ marginBottom: '20px', fontSize: '14px', lineHeight: '1.6' }}>
              <p>現在のデータがLocalStorageに保存されています。</p>
              <p>ログインすると、データをクラウドに保存して複数のデバイスで同期できます。</p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
                onClick={handleCloudSave}
              >
                クラウドに保存
              </button>
              <button
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
                onClick={() => setHasLocalData(false)}
              >
                後で
              </button>
            </div>
          </div>
        </div>
      )}

      {/* カテゴリー管理モーダル */}
      <div className={`modal ${showCategoryModal ? 'active' : ''}`}>
        <div className="modal-content">
          <div className="modal-header">
            <h2 className="modal-title">カテゴリー管理</h2>
            <button className="close-btn" onClick={() => setShowCategoryModal(false)}>
              &times;
            </button>
          </div>

          <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>
            ドラッグして並べ替えができます
          </p>

          <div className="category-list">
            {orderedCategories.map(([key, cat]) => {
              const memosInCategory = memos.filter(m => m.category === key).length

              return (
                <div key={key} className="category-item" data-category-key={key}>
                  <span className="drag-handle">≡</span>
                  <div
                    className="category-icon"
                    onClick={() => setShowIconPicker(showIconPicker === key ? null : key)}
                  >
                    {cat.icon}
                  </div>
                  <div
                    className="category-color"
                    style={{ backgroundColor: cat.color }}
                    onClick={() => setShowColorPicker(showColorPicker === key ? null : key)}
                  />
                  <input
                    type="text"
                    className="category-name-input"
                    value={cat.name}
                    onChange={(e) => updateCategoryName(key, e.target.value)}
                  />
                  <button
                    className="category-delete-btn"
                    onClick={() => deleteCategory(key)}
                    disabled={memosInCategory > 0}
                  >
                    削除 {memosInCategory > 0 && `(${memosInCategory})`}
                  </button>

                  {showIconPicker === key && (
                    <div className="icon-picker active" style={{ position: 'absolute', zIndex: 1001 }}>
                      {availableIcons.map(icon => (
                        <div
                          key={icon}
                          className="icon-option"
                          onClick={() => {
                            setCategories(prev => ({
                              ...prev,
                              [key]: { ...prev[key], icon }
                            }))
                            saveCategories()
                            setShowIconPicker(null)
                          }}
                        >
                          {icon}
                        </div>
                      ))}
                    </div>
                  )}

                  {showColorPicker === key && (
                    <div className="color-picker active" style={{ position: 'absolute', zIndex: 1001 }}>
                      {availableColors.map(color => (
                        <div
                          key={color}
                          className="color-option"
                          style={{ backgroundColor: color }}
                          onClick={() => {
                            setCategories(prev => ({
                              ...prev,
                              [key]: { ...prev[key], color }
                            }))
                            saveCategories()
                            setShowColorPicker(null)
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="add-category-form">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="新しいカテゴリー名"
              onKeyPress={(e) => e.key === 'Enter' && addNewCategory()}
            />
            <button onClick={addNewCategory}>追加</button>
          </div>
        </div>
      </div>
    </div>
  )
}
