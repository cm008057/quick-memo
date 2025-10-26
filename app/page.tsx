'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import AuthModal from '@/components/AuthModal'
import { authService } from '@/lib/auth'
import { dataService } from '@/lib/data-service'
import { hardDeleteMemo } from '@/lib/delete-memo'
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
  updated_at?: string
  deleted?: boolean
}

// 新しいツリー管理用のデータ構造
interface TreeNode {
  id: string
  text: string
  completed: boolean
  collapsed: boolean
  level: number
  templateType?: string  // 大項目タイプ（オプション）
  description?: string  // 説明文
  showDescription?: boolean  // 説明欄を表示するか
}

interface TreeTemplate {
  id: string
  name: string  // 「目指す姿」など
  order: number
  prefix: string  // 「【目指す姿】」などのプレフィックス
  color: string  // 色コード
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
const availableIcons = ['💡', '💬', '📄', '📅', '📚', '🙏', '⭐', '❗', '✅', '🎯', '🔔', '📌', '🏷️', '💰', '🏠', '🚗', '✈️', '🍴', '💊', '🎉', '✨', '📝', '🎮', '🎵', '🎨', '💻', '📱', '⚡', '🔥', '🌟']
const availableColors = ['#fbbf24', '#3b82f6', '#10b981', '#f43f5e', '#8b5cf6', '#fb923c', '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6366f1', '#14b8a6', '#ef4444', '#a855f7', '#22c55e', '#0ea5e9', '#f59e0b', '#10b981', '#64748b', '#71717a']

// 10段階の色グラデーション（赤→オレンジ→黄色→緑→青）
const templateColors = [
  '#ef4444', // 1. 赤
  '#f97316', // 2. 赤オレンジ
  '#fb923c', // 3. オレンジ
  '#fbbf24', // 4. 黄色オレンジ
  '#eab308', // 5. 黄色
  '#84cc16', // 6. 黄緑
  '#22c55e', // 7. 緑
  '#14b8a6', // 8. 青緑
  '#3b82f6', // 9. 青
  '#6366f1'  // 10. 濃い青
]

// デフォルトのツリーテンプレート
const defaultTreeTemplates: TreeTemplate[] = [
  { id: 'template-1', name: '人生の目的', order: 1, prefix: '', color: templateColors[0] },
  { id: 'template-2', name: '理想の姿', order: 2, prefix: '', color: templateColors[1] },
  { id: 'template-3', name: '課題', order: 3, prefix: '', color: templateColors[2] },
  { id: 'template-4', name: 'アイデア', order: 4, prefix: '', color: templateColors[3] }
]

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
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [draggedMemoId, setDraggedMemoId] = useState<number | null>(null) // ドラッグ中のメモID
  const [dragOverMemoId, setDragOverMemoId] = useState<number | null>(null) // ドラッグオーバー中のメモID
  const [touchStartY, setTouchStartY] = useState<number>(0) // タッチ開始Y座標
  const [isDraggingTouch, setIsDraggingTouch] = useState<boolean>(false) // タッチドラッグ中フラグ
  const [isLongPressActive, setIsLongPressActive] = useState<boolean>(false) // 長押し検出フラグ

  // ツリー管理画面の状態
  const [viewMode, setViewMode] = useState<'quick' | 'tree'>('quick') // 画面切り替え
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([]) // ツリーのノード
  const [treeTemplates, setTreeTemplates] = useState<TreeTemplate[]>(defaultTreeTemplates) // テンプレート
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null) // 編集中のノードID
  const [showMemoPickerFor, setShowMemoPickerFor] = useState<string | null>(null) // メモピッカーを表示するノードID
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set()) // 折りたたまれたカテゴリー
  const [showTemplateModal, setShowTemplateModal] = useState<boolean>(false) // テンプレート設定モーダル
  const [currentTemplateIndex, setCurrentTemplateIndex] = useState<number>(0) // 現在選択中の大項目インデックス
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null) // ドラッグ中のノードID
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null) // ドラッグオーバー中のノードID
  const [treeHistory, setTreeHistory] = useState<TreeNode[][]>([]) // ツリーの履歴
  const [treeHistoryIndex, setTreeHistoryIndex] = useState<number>(-1) // 現在のツリー履歴位置

  // 認証関連のstate
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [user, setUser] = useState<any>(null)
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [hasLocalData, setHasLocalData] = useState<boolean>(false)
  const [isDeleting, setIsDeleting] = useState<boolean>(false)
  const [isImporting, setIsImporting] = useState<boolean>(false)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [isSyncing, setIsSyncing] = useState<boolean>(false)

  // Undo/Redo用の履歴
  const [history, setHistory] = useState<Array<{ memos: Memo[], memoOrder: number[] }>>([])
  const [historyIndex, setHistoryIndex] = useState<number>(-1)
  const isUndoRedoRef = useRef<boolean>(false) // Undo/Redo実行中フラグ

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const isSelectingFileRef = useRef<boolean>(false) // ファイル選択ダイアログ表示中フラグ
  const scrollPositionRef = useRef<number>(0) // スクロール位置を保存
  const lastFocusTimeRef = useRef<number>(0) // 最後のフォーカス時刻を保存
  const searchScrollPositionRef = useRef<number>(0) // 検索中のスクロール位置を保存
  const isSearchFocusedRef = useRef<boolean>(false) // 検索フォーカス中フラグ
  const memoInputFocusedRef = useRef<boolean>(false) // メモ入力欄フォーカス中フラグ
  const lastUserInteractionRef = useRef<number>(0) // 最後のユーザー操作時刻
  const userInteractionTimerRef = useRef<NodeJS.Timeout | null>(null) // ユーザー操作タイマー
  const pageLoadTimeRef = useRef<number>(Date.now()) // ページロード時刻
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null) // 長押しタイマー

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

  // 履歴に追加
  const saveToHistory = useCallback((currentMemos: Memo[], currentMemoOrder: number[]) => {
    // Undo/Redo実行中は履歴に追加しない
    if (isUndoRedoRef.current) return

    setHistory(prev => {
      // 現在の位置より後ろの履歴を削除
      const newHistory = prev.slice(0, historyIndex + 1)
      // 新しい状態を追加
      newHistory.push({
        memos: JSON.parse(JSON.stringify(currentMemos)),
        memoOrder: [...currentMemoOrder]
      })
      // 最大50件まで保持
      if (newHistory.length > 50) {
        newHistory.shift()
        return newHistory
      }
      return newHistory
    })
    setHistoryIndex(prev => Math.min(prev + 1, 49))
  }, [historyIndex])

  // Undo
  const undo = async () => {
    if (historyIndex <= 0) return

    isUndoRedoRef.current = true
    const previousState = history[historyIndex - 1]
    setMemos(previousState.memos)
    setMemoOrder(previousState.memoOrder)
    setHistoryIndex(prev => prev - 1)

    await saveMemos(previousState.memos, previousState.memoOrder)
    setTimeout(() => {
      isUndoRedoRef.current = false
    }, 100)
  }

  // Redo
  const redo = async () => {
    if (historyIndex >= history.length - 1) return

    isUndoRedoRef.current = true
    const nextState = history[historyIndex + 1]
    setMemos(nextState.memos)
    setMemoOrder(nextState.memoOrder)
    setHistoryIndex(prev => prev + 1)

    await saveMemos(nextState.memos, nextState.memoOrder)
    setTimeout(() => {
      isUndoRedoRef.current = false
    }, 100)
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

  // デバウンス用のタイマー参照
  const loadDataTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Supabaseからデータを読み込み（デバウンス付き）
  const loadDataFromSupabase = useCallback(async (debounceMs: number = 0, preserveScroll: boolean = false, isInitialLoad: boolean = false) => {
    // 削除処理中は読み込みをスキップ（重要：削除の妨害を防ぐ）
    // ただしインポート中は読み込みを許可
    if (isDeleting && !isImporting) {
      console.log('🚫 削除処理中のためデータ読み込みをスキップ')
      return
    }

    // 保存処理中は読み込みをスキップ（Race Condition防止）
    if (isSaving) {
      console.log('🚫 保存処理中のためデータ読み込みをスキップ')
      return
    }

    // ページロード後5秒以内は、ユーザー操作チェックをスキップ（スマホでの初回読み込み問題対策）
    const timeSincePageLoad = Date.now() - pageLoadTimeRef.current
    const skipUserInteractionCheck = isInitialLoad || timeSincePageLoad < 5000

    // 🔧 重要: 入力中・編集中・検索中は読み込みをスキップ（初回読み込み時は除く）
    if (!skipUserInteractionCheck) {
      if (memoInputFocusedRef.current) {
        console.log('🚫 メモ入力中のためデータ読み込みをスキップ')
        return
      }
      if (editingMemo !== null) {
        console.log('🚫 メモ編集中のためデータ読み込みをスキップ')
        return
      }
      if (isSearchFocusedRef.current) {
        console.log('🚫 検索中のためデータ読み込みをスキップ')
        return
      }

      // 🔧 重要: ユーザー操作後3秒以内は読み込みをスキップ
      const timeSinceLastInteraction = Date.now() - lastUserInteractionRef.current
      if (timeSinceLastInteraction < 3000) {
        console.log(`🚫 ユーザー操作中のためデータ読み込みをスキップ（${Math.floor(timeSinceLastInteraction / 1000)}秒前）`)
        return
      }
    }

    // 既存のタイマーをクリア
    if (loadDataTimerRef.current) {
      clearTimeout(loadDataTimerRef.current)
      loadDataTimerRef.current = null
    }

    // デバウンス処理
    if (debounceMs > 0) {
      return new Promise<void>((resolve) => {
        loadDataTimerRef.current = setTimeout(async () => {
          await loadDataFromSupabase(0, preserveScroll, isInitialLoad) // デバウンスなしで実際の処理を実行
          resolve()
        }, debounceMs)
      })
    }

    // 読み込み中の重複実行を防止（排他制御）
    if (isSyncing) {
      console.log('⏳ 既に同期中のため、スキップします')
      return
    }

    // スクロール位置を保存
    if (preserveScroll) {
      scrollPositionRef.current = window.scrollY || document.documentElement.scrollTop
    }

    console.log('📥 Supabaseデータ読み込み開始')

    setIsSyncing(true)
    setIsLoading(true)
    try {
      console.log('📥 Supabaseデータ読み込み開始')
      const { categories: dbCategories, categoryOrder: dbCategoryOrder } = await dataService.loadCategories()
      const dbMemos = await dataService.loadMemos()
      const dbMemoOrder = await dataService.loadMemoOrder()

      console.log(`✅ 読み込み完了: ${dbMemos.length}件のメモ, ${Object.keys(dbCategories).length}個のカテゴリー, 並び順: ${dbMemoOrder.length}件`)

      // データがあるかどうかに関わらず、Supabaseの結果を表示
      setCategories(Object.keys(dbCategories).length > 0 ? dbCategories : defaultCategories)
      setCategoryOrder(dbCategoryOrder.length > 0 ? dbCategoryOrder : Object.keys(defaultCategories))

      // 削除フラグが付いていないメモのみを使用
      const validMemos = dbMemos.filter((m: Memo) => m.deleted !== true)
      const deletedCount = dbMemos.length - validMemos.length
      if (deletedCount > 0) {
        console.log(`削除済みを除外: ${deletedCount}件`)
      }

      // 表示順序の決定
      let sortedMemos: Memo[]
      let finalMemoOrder: number[]

      if (dbMemoOrder.length > 0) {
        // 保存された並び順がある場合はそれを使用
        console.log(`📋 保存された並び順を使用: ${dbMemoOrder.length}件`)

        // 保存された順序に従ってメモを並べ替え
        const orderedMemos = dbMemoOrder
          .map(id => validMemos.find(m => m.id === id))
          .filter((m): m is Memo => m !== undefined)

        // 新しく追加されたメモ（順序にないもの）を先頭に追加
        const newMemos = validMemos.filter(m => !dbMemoOrder.includes(m.id))
        if (newMemos.length > 0) {
          newMemos.sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime()
            const timeB = new Date(b.timestamp).getTime()
            return timeB - timeA
          })
          console.log(`🆕 新規メモ${newMemos.length}件を先頭に追加`)
        }

        sortedMemos = [...newMemos, ...orderedMemos]
        finalMemoOrder = sortedMemos.map(m => m.id)
      } else {
        // 保存された並び順がない場合
        // 現在のページに表示されているメモの順序を取得
        const currentDisplayOrder = memos.length > 0 ? memos.map(m => m.id) : []

        if (currentDisplayOrder.length > 0) {
          // 既にメモが表示されている場合は、その順序を保持
          const orderedMemos = currentDisplayOrder
            .map(id => validMemos.find(m => m.id === id))
            .filter((m): m is Memo => m !== undefined)

          // 新しく追加されたメモ（現在の順序にないもの）を先頭に追加
          const newMemos = validMemos.filter(m => !currentDisplayOrder.includes(m.id))
          newMemos.sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime()
            const timeB = new Date(b.timestamp).getTime()
            return timeB - timeA
          })

          sortedMemos = [...newMemos, ...orderedMemos]
          if (newMemos.length > 0) {
            console.log(`🔄 順序保持: 新規${newMemos.length}件 + 既存${orderedMemos.length}件 = 合計${sortedMemos.length}件`)
          }
        } else {
          // 初回読み込み時のみ最新順
          console.log('🆕 初回読み込み - 最新順で表示')
          sortedMemos = validMemos.sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime()
            const timeB = new Date(b.timestamp).getTime()
            return timeB - timeA
          })
        }
        finalMemoOrder = sortedMemos.map(m => m.id)
      }

      setMemos(sortedMemos)
      setMemoOrder(finalMemoOrder)

      // 🔧 重要: 選択中のカテゴリーが有効なら保持、無効なら最初のカテゴリーを選択
      const newCategories = Object.keys(dbCategories).length > 0 ? dbCategories : defaultCategories
      if (!newCategories[selectedCategory]) {
        // 現在のカテゴリーが存在しない場合のみ変更（カテゴリー削除時など）
        const newSelectedCategory = Object.keys(newCategories)[0]
        setSelectedCategory(newSelectedCategory)
        console.log(`📂 カテゴリー変更: ${selectedCategory} → ${newSelectedCategory}（元のカテゴリーが削除されました）`)
      } else {
        console.log(`📂 カテゴリー保持: ${selectedCategory}`)
      }

      console.log(`✅ データ設定完了: ${sortedMemos.length}件`)

      // ローカルデータチェックも実行
      checkForLocalData()
    } catch (error) {
      console.error('❌ データの読み込みに失敗:', error)
    } finally {
      setIsLoading(false)
      setIsSyncing(false)

      // スクロール位置を復元
      if (preserveScroll && scrollPositionRef.current > 0) {
        setTimeout(() => {
          window.scrollTo(0, scrollPositionRef.current)
        }, 50)
      }
    }
  }, [isDeleting, isImporting, isSaving, isSyncing, editingMemo]) // editingMemoを依存関係に追加

  // ユーザー操作の検出
  useEffect(() => {
    const updateLastInteraction = () => {
      lastUserInteractionRef.current = Date.now()

      // 既存のタイマーをクリア
      if (userInteractionTimerRef.current) {
        clearTimeout(userInteractionTimerRef.current)
      }
    }

    // タッチ、クリック、スクロール、キーボード操作を検出
    const events = ['touchstart', 'touchmove', 'scroll', 'click', 'keydown', 'wheel']

    events.forEach(event => {
      document.addEventListener(event, updateLastInteraction, { passive: true })
    })

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateLastInteraction)
      })
      if (userInteractionTimerRef.current) {
        clearTimeout(userInteractionTimerRef.current)
      }
    }
  }, [])

  // 検索フィールド外のクリックで画面固定を解除
  useEffect(() => {
    const handleClickOutsideSearch = (e: MouseEvent | TouchEvent) => {
      // 検索フィールドがフォーカスされていない場合は何もしない
      if (!isSearchFocusedRef.current) return

      const target = e.target as HTMLElement
      // 検索フィールドまたは検索クリアボタンをクリックした場合は何もしない
      if (target.closest('.search-input') || target.closest('.search-clear')) {
        return
      }

      // それ以外をクリック/タッチしたら画面固定を解除
      if (window.innerWidth <= 600) {
        isSearchFocusedRef.current = false
        const scrollY = searchScrollPositionRef.current

        document.body.style.overflow = ''
        document.body.style.position = ''
        document.body.style.width = ''
        document.body.style.top = ''

        window.scrollTo(0, scrollY)
      }
    }

    document.addEventListener('click', handleClickOutsideSearch)
    document.addEventListener('touchstart', handleClickOutsideSearch)

    return () => {
      document.removeEventListener('click', handleClickOutsideSearch)
      document.removeEventListener('touchstart', handleClickOutsideSearch)
    }
  }, [])

  // ピッカーの外側クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // ピッカー自体、またはアイコン/カラーボタンをクリックした場合は何もしない
      if (target.closest('.icon-picker') || target.closest('.color-picker') ||
          target.closest('.category-icon') || target.closest('.category-color')) {
        return
      }
      // それ以外をクリックしたらピッカーを閉じる
      setShowIconPicker(null)
      setShowColorPicker(null)
    }

    if (showIconPicker !== null || showColorPicker !== null) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [showIconPicker, showColorPicker])

  // 認証状態の監視と初期化
  useEffect(() => {
    // 環境変数のデバッグ
    console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '設定済み' : '未設定')
    console.log('Supabase Key:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '設定済み' : '未設定')

    const { data: { subscription } } = authService.onAuthStateChange(async (user) => {
      console.log('Auth state changed:', user ? 'ログイン中' : '未ログイン')
      setUser(user)

      // ローディング・同期フラグを強制リセットしてからデータ読み込み
      setIsLoading(false)
      setIsSyncing(false)
      setIsSaving(false)
      setIsDeleting(false)

      // 100ms待ってからデータ読み込み
      setTimeout(async () => {
        console.log('🔄 データ読み込み開始（初回）')
        try {
          await loadDataFromSupabase(0, false, true) // isInitialLoad = true
        } catch (error) {
          console.error('Supabaseデータの読み込みに失敗:', error)
          loadDataFromLocalStorage()
          checkForLocalData()
        }
      }, 100)
    })

    return () => {
      // クリーンアップ：タイマーをクリア
      if (loadDataTimerRef.current) {
        clearTimeout(loadDataTimerRef.current)
      }
      subscription?.unsubscribe?.()
    }
  }, []) // 依存関係を空配列にして初回のみ実行

  // グローバルキーボードショートカット（Undo/Redo）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 入力欄にフォーカスがある場合はショートカットを無効化
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey

      // Undo: Cmd+Z / Ctrl+Z
      if (isCtrlOrCmd && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (viewMode === 'quick') {
          undo()
        } else {
          undoTree()
        }
      }
      // Redo: Cmd+Y / Ctrl+Y
      else if (isCtrlOrCmd && e.key === 'y') {
        e.preventDefault()
        if (viewMode === 'quick') {
          redo()
        } else {
          redoTree()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode])

  // メモ削除イベントリスナーと定期同期
  useEffect(() => {
    const handleMemoDeleted = (event: CustomEvent) => {
      console.log('🔄 削除イベントを受信、データを再読み込み:', event.detail)
      // 削除後は即座にデータを再読み込み
      setTimeout(() => {
        loadDataFromSupabase(0, true) // スクロール位置を保持
      }, 200)
    }

    // 削除イベントリスナーを追加
    window.addEventListener('memoDeleted', handleMemoDeleted as EventListener)

    // モバイル判定
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    // 定期的にデータをチェック（他のデバイスでの変更を検出）
    // 🔧 修正: モバイルは60秒、PCは30秒間隔
    const syncInterval = setInterval(() => {
      if (user && !isLoading && !isDeleting && !isImporting && !isSaving && !isSyncing) {
        console.log(`🔄 定期同期チェック (${isMobile ? '60' : '30'}秒間隔)`)
        loadDataFromSupabase(0, true) // スクロール位置を保持
      }
    }, isMobile ? 60000 : 30000) // モバイルは60秒、PCは30秒ごと

    return () => {
      window.removeEventListener('memoDeleted', handleMemoDeleted as EventListener)
      clearInterval(syncInterval)
    }
  }, [user, isLoading, isImporting, isDeleting, isSaving, isSyncing, loadDataFromSupabase])

  // ウィンドウフォーカスとページ可視性変更時の即座同期（他のデバイスでの変更を検出）
  useEffect(() => {
    const handleWindowFocus = () => {
      // 🔧 修正: ファイル選択中はスキップ
      if (isSelectingFileRef.current) {
        console.log('📂 ファイル選択中のため、フォーカス同期をスキップ')
        return
      }

      // 🔧 修正: 頻繁なフォーカスイベントを防ぐため、5秒以内の再フォーカスはスキップ
      const now = Date.now()
      if (now - lastFocusTimeRef.current < 5000) {
        console.log('⏭️ フォーカスイベントが頻繁すぎるためスキップ（5秒以内）')
        return
      }
      lastFocusTimeRef.current = now

      // 🔧 修正: 保存/同期中のチェックを追加
      if (user && !isLoading && !isDeleting && !isImporting && !isSaving && !isSyncing) {
        console.log('👁️ ウィンドウフォーカス検出 - データ同期')
        loadDataFromSupabase(0, true) // スクロール位置を保持
      }
    }

    const handleVisibilityChange = () => {
      // 🔧 修正: ファイル選択中はスキップ
      if (isSelectingFileRef.current) {
        console.log('📂 ファイル選択中のため、可視性同期をスキップ')
        return
      }

      // 🔧 修正: 頻繁なイベントを防ぐため、5秒以内の再発火はスキップ
      const now = Date.now()
      if (now - lastFocusTimeRef.current < 5000) {
        console.log('⏭️ 可視性イベントが頻繁すぎるためスキップ（5秒以内）')
        return
      }
      lastFocusTimeRef.current = now

      // 🔧 修正: 保存/同期中のチェックを追加
      if (document.visibilityState === 'visible' && user && !isLoading && !isDeleting && !isImporting && !isSaving && !isSyncing) {
        console.log('📱 ページ可視化検出 - データ同期')
        loadDataFromSupabase(0, true) // スクロール位置を保持
      }
    }

    // デスクトップ用
    window.addEventListener('focus', handleWindowFocus)
    // モバイル用（タブ切り替え、アプリ切り替え対応）
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [user, isLoading, isDeleting, isImporting, isSaving, isSyncing, loadDataFromSupabase])

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
      alert(`データをクラウドに同期しました！\n同期後: ${memos.length}件（重複は自動除外）`)
    } catch (error) {
      console.error('クラウド保存エラー:', error)
      alert('保存に失敗しました: ' + (error as Error).message)
    }
  }

  // タイムスタンプベースの同期：最新データを統合
  const syncCurrentDataToSupabase = async () => {
    try {
      console.log('タイムスタンプベース同期を開始...')
      console.log(`ローカルメモ数: ${memos.length}`)

      // Supabaseから既存データを取得
      const cloudMemos = await dataService.loadMemos()
      console.log(`クラウドメモ数: ${cloudMemos.length}`)

      // データ件数チェック：ローカルの方が多い場合は警告
      if (memos.length > cloudMemos.length + 10) {
        const useLocal = confirm(
          `データ件数の違いを検出しました：\n\n` +
          `ローカル: ${memos.length}件\n` +
          `クラウド: ${cloudMemos.length}件\n\n` +
          `ローカルの方が${memos.length - cloudMemos.length}件多いです。\n\n` +
          `「OK」= ローカルデータをクラウドに保存\n` +
          `「キャンセル」= クラウドデータで上書き`
        )

        if (useLocal) {
          // ローカルデータを優先してクラウドに保存
          console.log('ローカルデータを優先してクラウドに保存')
          await dataService.saveMemos(memos)
          await dataService.saveMemoOrder(memoOrder)
          alert(`ローカルデータ（${memos.length}件）をクラウドに保存しました！`)
          return
        }
      }

      // タイムスタンプベースでマージ
      const mergedMemos: Memo[] = []
      const processedIds = new Set<number>()

      // ローカルとクラウドの両方のメモを処理
      const allMemosSources = [
        ...memos.map(m => ({ ...m, source: 'local' as const })),
        ...cloudMemos.map(m => ({ ...m, source: 'cloud' as const }))
      ]

      // IDごとにグループ化
      const memoGroups = new Map<number, typeof allMemosSources>()
      allMemosSources.forEach(memo => {
        if (!memoGroups.has(memo.id)) {
          memoGroups.set(memo.id, [])
        }
        memoGroups.get(memo.id)!.push(memo)
      })

      // 各IDについて最新版を選択
      let excludedCount = 0
      memoGroups.forEach((memoVersions, id) => {
        if (memoVersions.length === 1) {
          // 片方にしか存在しない場合
          const memo = memoVersions[0]
          // deleted === true の場合のみ除外（明示的にtrueの場合のみ）
          if (memo.deleted !== true) {
            mergedMemos.push(memo)
          } else {
            excludedCount++
            console.log(`除外されたメモ (deleted=true): ID=${memo.id}, text="${memo.text?.substring(0, 20)}..."`)
          }
        } else {
          // 両方に存在する場合、タイムスタンプで最新を選択
          const latest = memoVersions.reduce((prev, curr) => {
            const prevTime = prev.updated_at || prev.timestamp
            const currTime = curr.updated_at || curr.timestamp
            return new Date(currTime) > new Date(prevTime) ? curr : prev
          })

          // 最新版が明示的に削除フラグ付きでなければ追加
          if (latest.deleted !== true) {
            mergedMemos.push(latest)
          } else {
            excludedCount++
            console.log(`除外されたメモ (deleted=true): ID=${latest.id}, text="${latest.text?.substring(0, 20)}..."`)
          }
        }
        processedIds.add(id)
      })

      console.log(`削除フラグによる除外数: ${excludedCount}件`)

      console.log(`同期後メモ数: ${mergedMemos.length}`)
      console.log(`削除されたメモ: ${memos.length + cloudMemos.length - mergedMemos.length}件`)

      // マージしたデータを保存（手動順序を維持）
      if (mergedMemos.length > 0) {
        // 既存のmemoOrderを維持し、新規メモのみ先頭に追加
        const existingOrder = memoOrder.filter(id => mergedMemos.some(m => m.id === id))
        const newMemoIds = mergedMemos
          .filter(m => !existingOrder.includes(m.id))
          .sort((a, b) => {
            // 新規メモは新しい順
            const timeA = new Date(a.updated_at || a.timestamp).getTime()
            const timeB = new Date(b.updated_at || b.timestamp).getTime()
            return timeB - timeA
          })
          .map(m => m.id)

        const updatedOrder = [...newMemoIds, ...existingOrder]

        // memoOrderに基づいてメモを並び替え
        const orderedMemos = updatedOrder
          .map(id => mergedMemos.find(m => m.id === id))
          .filter((m): m is Memo => m !== undefined)

        await dataService.saveMemos(orderedMemos)
        await dataService.saveMemoOrder(updatedOrder) // 順序も保存
        setMemos(orderedMemos)
        setMemoOrder(updatedOrder)
      } else {
        // 全て削除された場合
        await dataService.saveMemos([])
        setMemos([])
        setMemoOrder([])
      }

      // LocalStorageをクリア
      localStorage.removeItem('quickMemos')
      localStorage.removeItem('categories')
      localStorage.removeItem('categoryOrder')
      localStorage.removeItem('memoOrder')

      console.log('タイムスタンプベース同期完了')
      alert(`同期完了！\n最新のメモ数: ${mergedMemos.length}件`)
    } catch (error) {
      console.error('同期エラー:', error)
      throw error
    }
  }


  // 自動同期を無効化（手動同期のみ）
  // useEffect(() => {
  //   if (memos.length > 0 && !isLoading) {
  //     // 初回読み込み時以外で自動同期
  //     const timer = setTimeout(() => {
  //       autoSync()
  //     }, 1000) // 1秒後に同期

  //     return () => clearTimeout(timer)
  //   }
  // }, [memos, isLoading, autoSync])

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

  // ツリーデータの初期化（Supabase or LocalStorageから読み込み）
  useEffect(() => {
    const loadTreeData = async () => {
      try {
        if (user) {
          // ログイン中：Supabaseから読み込み
          try {
            const { nodes, templates } = await dataService.loadTreeData()
            if (nodes.length > 0 || templates.length > 0) {
              setTreeNodes(nodes)
              setTreeTemplates(templates)
              console.log(`✅ Supabaseからツリーデータを復元: ${nodes.length}ノード, ${templates.length}テンプレート`)
              // LocalStorageにもバックアップとして保存
              localStorage.setItem('treeNodes', JSON.stringify(nodes))
              localStorage.setItem('treeTemplates', JSON.stringify(templates))
              return
            }
          } catch (error) {
            console.error('Supabaseからの読み込みエラー、LocalStorageから読み込みます:', error)
          }
        }

        // 未ログインまたはSupabase読み込み失敗時：LocalStorageから読み込み
        const savedNodes = localStorage.getItem('treeNodes')
        const savedTemplates = localStorage.getItem('treeTemplates')

        if (savedNodes) {
          const parsedNodes = JSON.parse(savedNodes)
          setTreeNodes(parsedNodes)
          console.log(`✅ LocalStorageからツリーノードを復元: ${parsedNodes.length}ノード`)
        }

        if (savedTemplates) {
          const parsedTemplates = JSON.parse(savedTemplates)
          setTreeTemplates(parsedTemplates)
          console.log(`✅ LocalStorageからツリーテンプレートを復元: ${parsedTemplates.length}個`)
        }
      } catch (error) {
        console.error('ツリーデータの読み込みエラー:', error)
      }
    }

    loadTreeData()
  }, [user])

  // ツリーデータの自動保存（変更時）
  useEffect(() => {
    if (treeNodes.length > 0 || treeTemplates.length > 0) {
      const timer = setTimeout(() => {
        saveTreeData()
      }, 500) // 500ms後に保存

      return () => clearTimeout(timer)
    }
  }, [treeNodes, treeTemplates])

  // ツリーの履歴管理（Undo/Redo用）
  useEffect(() => {
    // Undo/Redo操作中は履歴に追加しない
    if (isUndoRedoRef.current) {
      return
    }

    // 初回ロード時や、履歴が空の場合は追加
    if (treeNodes.length > 0 || treeHistory.length === 0) {
      setTreeHistory(prev => {
        const newHistory = prev.slice(0, treeHistoryIndex + 1)
        newHistory.push([...treeNodes])
        return newHistory.slice(-50) // 最大50件まで保持
      })
      setTreeHistoryIndex(prev => Math.min(prev + 1, 49))
    }
  }, [treeNodes])

  // データ保存（認証状態に応じて自動選択）
  // 🔧 修正: 引数で保存するデータを受け取るように変更（Race Condition防止）
  const saveMemos = async (memosToSave?: Memo[], memoOrderToSave?: number[]) => {
    // 削除処理中は保存をスキップ（削除したメモの復活を防ぐ）
    // ただしインポート中は保存を許可
    if (isDeleting && !isImporting) {
      console.log('🚫 削除処理中のため保存をスキップ')
      return
    }

    // 保存中の重複実行を防止
    if (isSaving) {
      console.log('🚫 既に保存処理中のため、スキップします')
      return
    }

    // 引数がない場合は現在のstateを使用（後方互換性）
    const finalMemos = memosToSave ?? memos
    const finalMemoOrder = memoOrderToSave ?? memoOrder

    setIsSaving(true)
    try {
      if (user) {
        try {
          await dataService.saveMemos(finalMemos)
          await dataService.saveMemoOrder(finalMemoOrder)
          console.log(`✅ クラウド保存完了: ${finalMemos.length}件`)
        } catch (error) {
          console.error('メモの保存に失敗:', error)
          // フォールバック：LocalStorageに保存
          localStorage.setItem('quickMemos', JSON.stringify(finalMemos))
          localStorage.setItem('memoOrder', JSON.stringify(finalMemoOrder))
        }
      } else {
        // 未ログイン：LocalStorageに保存
        localStorage.setItem('quickMemos', JSON.stringify(finalMemos))
        localStorage.setItem('memoOrder', JSON.stringify(finalMemoOrder))
      }
    } finally {
      setIsSaving(false)
    }
  }

  // ツリーデータを保存
  const saveTreeData = async (nodesToSave?: TreeNode[], templatesToSave?: TreeTemplate[]) => {
    const finalNodes = nodesToSave ?? treeNodes
    const finalTemplates = templatesToSave ?? treeTemplates

    try {
      if (user) {
        try {
          // Supabaseに保存
          await dataService.saveTreeData(finalNodes, finalTemplates)

          // LocalStorageにもバックアップとして保存
          localStorage.setItem('treeNodes', JSON.stringify(finalNodes))
          localStorage.setItem('treeTemplates', JSON.stringify(finalTemplates))
          console.log(`✅ ツリーデータ保存完了: ${finalNodes.length}ノード`)
        } catch (error) {
          console.error('ツリーデータの保存に失敗:', error)
          // フォールバック：LocalStorageに保存
          localStorage.setItem('treeNodes', JSON.stringify(finalNodes))
          localStorage.setItem('treeTemplates', JSON.stringify(finalTemplates))
        }
      } else {
        // 未ログイン：LocalStorageに保存
        localStorage.setItem('treeNodes', JSON.stringify(finalNodes))
        localStorage.setItem('treeTemplates', JSON.stringify(finalTemplates))
      }
    } catch (error) {
      console.error('ツリーデータの保存エラー:', error)
    }
  }

  const saveCategories = async (categoriesToSave?: { [key: string]: Category }, categoryOrderToSave?: string[]) => {
    // 引数がない場合は現在のstateを使用（後方互換性）
    const finalCategories = categoriesToSave ?? categories
    const finalCategoryOrder = categoryOrderToSave ?? categoryOrder

    if (user) {
      try {
        await dataService.saveCategories(finalCategories, finalCategoryOrder)
      } catch (error) {
        console.error('カテゴリの保存に失敗:', error)
        // フォールバック：LocalStorageに保存
        localStorage.setItem('categories', JSON.stringify(finalCategories))
        localStorage.setItem('categoryOrder', JSON.stringify(finalCategoryOrder))
      }
    } else {
      // 未ログイン：LocalStorageに保存
      localStorage.setItem('categories', JSON.stringify(finalCategories))
      localStorage.setItem('categoryOrder', JSON.stringify(finalCategoryOrder))
    }
  }

  // メモを追加
  const addMemo = async () => {
    if (!memoInput.trim()) return

    // 🔧 重要: インポート中・削除中・保存中は操作を禁止
    if (isImporting || isDeleting || isSaving) {
      console.log('🚫 処理中のためメモ追加をスキップ')
      return
    }

    // 履歴に追加（操作前の状態を保存）
    saveToHistory(memos, memoOrder)

    const newMemo: Memo = {
      id: Date.now(),
      text: memoInput.trim(),
      category: selectedCategory,
      timestamp: new Date().toLocaleString('ja-JP'),
      completed: false,
      updated_at: new Date().toISOString(),
      deleted: false
    }

    console.log('新しいメモを追加: ID=' + newMemo.id)

    // 状態を更新
    const updatedMemos = [newMemo, ...memos]
    const updatedMemoOrder = [newMemo.id, ...memoOrder]
    setMemos(updatedMemos)
    setMemoOrder(updatedMemoOrder)
    setMemoInput('')

    // 🔧 修正: 明示的に更新後のデータを保存（Race Condition防止）
    await saveMemos(updatedMemos, updatedMemoOrder)
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

  const saveMemoEdit = async (id: number) => {
    // 🔧 重要: インポート中・削除中・保存中は操作を禁止
    if (isImporting || isDeleting || isSaving) {
      console.log('🚫 処理中のためメモ編集保存をスキップ')
      setEditingMemo(null)
      setEditText('')
      return
    }

    if (editText.trim()) {
      // 履歴に追加（操作前の状態を保存）
      saveToHistory(memos, memoOrder)

      // 🔧 修正: 更新後のメモを明示的に計算してから保存
      const updatedMemos = memos.map(m =>
        m.id === id ? { ...m, text: editText.trim(), updated_at: new Date().toISOString() } : m
      )
      setMemos(updatedMemos)
      await saveMemos(updatedMemos)
    }
    setEditingMemo(null)
    setEditText('')
  }

  const cancelMemoEdit = () => {
    setEditingMemo(null)
    setEditText('')
  }

  // メモを完了/未完了切り替え
  const toggleComplete = async (id: number) => {
    // 🔧 重要: インポート中・削除中・保存中は操作を禁止
    if (isImporting || isDeleting || isSaving) {
      console.log('🚫 処理中のため完了状態変更をスキップ')
      return
    }

    // 履歴に追加（操作前の状態を保存）
    saveToHistory(memos, memoOrder)

    // 🔧 修正: 更新後のメモを明示的に計算してから保存
    const updatedMemos = memos.map(m =>
      m.id === id ? { ...m, completed: !m.completed, updated_at: new Date().toISOString() } : m
    )
    setMemos(updatedMemos)
    await saveMemos(updatedMemos)
  }

  // メモを削除（ソフト削除）
  const deleteMemo = async (id: number) => {
    // 🔧 重要: インポート中は削除を禁止（データ破損防止）
    if (isImporting) {
      console.log('🚫 インポート処理中のため削除をブロック')
      alert('インポート処理中は削除できません。インポート完了後にお試しください。')
      return
    }

    // 🔧 重要: 保存中は削除を禁止（Race Condition防止）
    if (isSaving) {
      console.log('🚫 保存処理中のため削除をブロック')
      alert('保存処理中は削除できません。少々お待ちください。')
      return
    }

    if (confirm('このメモを削除しますか？')) {
      // 履歴に追加（操作前の状態を保存）
      saveToHistory(memos, memoOrder)
      console.log(`🗑️ 削除処理開始: ID=${id}`)

      // 削除処理中フラグを設定（自動保存を無効化）
      setIsDeleting(true)

      // 表示からは即座に削除
      const originalMemos = [...memos]
      const originalOrder = [...memoOrder]

      setMemos(prev => prev.filter(m => m.id !== id))
      setMemoOrder(prev => prev.filter(mId => mId !== id))

      // LocalStorageを直接更新（saveMemos関数は削除中なのでスキップされる）
      const filteredMemos = memos.filter(m => m.id !== id)
      const filteredOrder = memoOrder.filter(mId => mId !== id)
      localStorage.setItem('quickMemos', JSON.stringify(filteredMemos))
      localStorage.setItem('memoOrder', JSON.stringify(filteredOrder))

      // クラウドで物理削除を実行
      try {
        const userId = user?.id || 'test-user-123'
        console.log(`🔐 認証チェック: userId=${userId}`)

        await hardDeleteMemo(id, userId)
        console.log(`✅ メモ削除完了（物理削除）: ID=${id}`)

        // 削除成功後、即座にデータを再読み込み
        console.log('🔄 削除後のデータ再読み込み開始')
        await loadDataFromSupabase(0)

        // 他のデバイス用の削除イベントを発火
        window.dispatchEvent(new CustomEvent('memoDeleted', { detail: { id } }))

        console.log('🎉 削除処理とデータ同期完了')

      } catch (error) {
        console.error('❌ クラウド削除エラー:', error)
        // エラー時は元に戻す
        setMemos(originalMemos)
        setMemoOrder(originalOrder)
        localStorage.setItem('quickMemos', JSON.stringify(originalMemos))
        localStorage.setItem('memoOrder', JSON.stringify(originalOrder))

        // より詳細なエラーメッセージ
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        alert(`削除に失敗しました: ${errorMessage}\nもう一度お試しください。`)
      } finally {
        // 削除処理完了フラグをリセット
        setIsDeleting(false)
        console.log('🔓 削除処理完了 - 自動保存を再開')

        // 削除処理完了後の追加同期（他のデバイス向け）
        setTimeout(() => {
          console.log('🔄 削除完了後の追加同期チェック（3秒後）')
          loadDataFromSupabase(0)
        }, 3000)
      }
    }
  }

  // ツリー管理：新しいノードを追加
  const addTreeNode = (parentId: string | null = null, templateType?: string, templateIndex?: number) => {
    // テンプレートインデックスが指定されていない場合は現在のインデックスを使用
    const useTemplateIndex = templateIndex !== undefined ? templateIndex : currentTemplateIndex
    const template = treeTemplates[useTemplateIndex]

    const newNode: TreeNode = {
      id: Date.now().toString(),
      text: '', // 入力欄は空白から開始
      completed: false,
      collapsed: false,
      level: 0, // デフォルトはレベル0
      templateType: template?.id
    }

    setTreeNodes(prev => [...prev, newNode])

    setEditingNodeId(newNode.id)
  }

  // 履歴管理：ツリーを更新して履歴に追加
  const updateTreeNodesWithHistory = (newNodes: TreeNode[]) => {
    setTreeNodes(newNodes)
    setTreeHistory(prev => {
      const newHistory = prev.slice(0, treeHistoryIndex + 1)
      newHistory.push(newNodes)
      return newHistory.slice(-50) // 最大50件まで保持
    })
    setTreeHistoryIndex(prev => Math.min(prev + 1, 49))
  }

  // 戻る
  const undoTree = () => {
    if (treeHistoryIndex > 0) {
      const newIndex = treeHistoryIndex - 1
      setTreeHistoryIndex(newIndex)
      isUndoRedoRef.current = true
      setTreeNodes(treeHistory[newIndex])
      setTimeout(() => {
        isUndoRedoRef.current = false
      }, 0)
    }
  }

  // 進む
  const redoTree = () => {
    if (treeHistoryIndex < treeHistory.length - 1) {
      const newIndex = treeHistoryIndex + 1
      setTreeHistoryIndex(newIndex)
      isUndoRedoRef.current = true
      setTreeNodes(treeHistory[newIndex])
      setTimeout(() => {
        isUndoRedoRef.current = false
      }, 0)
    }
  }

  // ノードを更新
  const updateTreeNode = (nodeId: string, updates: Partial<TreeNode>) => {
    setTreeNodes(prev => prev.map(node =>
      node.id === nodeId ? { ...node, ...updates } : node
    ))
  }

  // ノードを削除（子要素は1つ上の階層に移動）
  const deleteTreeNode = (nodeId: string) => {
    setTreeNodes(prev => {
      const index = prev.findIndex(n => n.id === nodeId)
      if (index === -1) return prev

      const deletedNode = prev[index]
      const result = [...prev]

      // 削除対象を除去
      result.splice(index, 1)

      // 直後の子要素（levelが1つ大きい連続したノード）のlevelを1つ下げる
      let i = index
      while (i < result.length && result[i].level > deletedNode.level) {
        if (result[i].level === deletedNode.level + 1) {
          result[i] = { ...result[i], level: result[i].level - 1 }
        }
        i++
      }

      return result
    })
  }

  // ドラッグアンドドロップ：ノードを並び替え
  const moveTreeNode = (draggedId: string, targetId: string, position: 'before' | 'after') => {
    setTreeNodes(prev => {
      const draggedIndex = prev.findIndex(n => n.id === draggedId)
      const targetIndex = prev.findIndex(n => n.id === targetId)

      if (draggedIndex === -1 || targetIndex === -1) return prev

      const result = [...prev]
      const [draggedNode] = result.splice(draggedIndex, 1)

      // targetIndexを再計算（draggedを削除したので変わる可能性がある）
      const newTargetIndex = result.findIndex(n => n.id === targetId)
      const insertIndex = position === 'before' ? newTargetIndex : newTargetIndex + 1

      result.splice(insertIndex, 0, draggedNode)

      return result
    })
  }

  // ノードを1階層上に移動（アンインデント）- levelプロパティを変更
  const unindentTreeNode = (nodeId: string) => {
    setTreeNodes(prev => prev.map(node => {
      if (node.id === nodeId) {
        const newLevel = Math.max(0, (node.level || 0) - 1)
        const newTemplate = treeTemplates[newLevel]
        return {
          ...node,
          level: newLevel,
          templateType: newTemplate?.id || node.templateType
        }
      }
      return node
    }))
  }

  // ノードを1階層下に移動（インデント）- levelプロパティを変更
  const indentTreeNode = (nodeId: string) => {
    setTreeNodes(prev => prev.map(node => {
      if (node.id === nodeId) {
        const newLevel = (node.level || 0) + 1
        if (newLevel >= treeTemplates.length) {
          return node // 最大階層に達している場合は変更しない
        }
        const newTemplate = treeTemplates[newLevel]
        return {
          ...node,
          level: newLevel,
          templateType: newTemplate?.id || node.templateType
        }
      }
      return node
    }))
  }

  // ノードの後に兄弟ノードを追加（Shift+Enter用）
  const addSiblingAfterNode = (nodeId: string, templateIndex?: number) => {
    setTreeNodes(prev => {
      const nodeIndex = prev.findIndex(n => n.id === nodeId)
      if (nodeIndex === -1) return prev

      const currentNode = prev[nodeIndex]
      const useTemplateIndex = templateIndex !== undefined ? templateIndex : currentTemplateIndex
      const template = treeTemplates[useTemplateIndex]

      const newNode: TreeNode = {
        id: Date.now().toString(),
        text: '',
        completed: false,
        collapsed: false,
        level: currentNode.level, // 同じレベル
        templateType: template?.id
      }

      const result = [...prev]
      result.splice(nodeIndex + 1, 0, newNode)
      return result
    })

    setEditingNodeId((Date.now()).toString())
  }

  // カテゴリを移動
  const moveToCategory = async (memoId: number, newCategory: string) => {
    // 🔧 重要: インポート中・削除中・保存中は操作を禁止
    if (isImporting || isDeleting || isSaving) {
      console.log('🚫 処理中のためカテゴリ移動をスキップ')
      return
    }

    const updatedMemos = memos.map(m =>
      m.id === memoId ? { ...m, category: newCategory, updated_at: new Date().toISOString() } : m
    )
    setMemos(updatedMemos)
    setShowCategoryMenu(null)
    showNotification(`メモを「${categories[newCategory]?.name}」に移動しました`)

    // 🔧 修正: 一度だけ保存（二重保存を防止）
    await saveMemos(updatedMemos)
  }

  // カテゴリにコピー
  const copyToCategory = async (memoId: number, targetCategory: string) => {
    // 🔧 重要: インポート中・削除中・保存中は操作を禁止
    if (isImporting || isDeleting || isSaving) {
      console.log('🚫 処理中のためカテゴリコピーをスキップ')
      return
    }

    const originalMemo = memos.find(m => m.id === memoId)
    if (!originalMemo) return

    const newMemo: Memo = {
      id: Date.now(),
      text: originalMemo.text,
      category: targetCategory,
      completed: false,
      timestamp: new Date().toLocaleString('ja-JP'),
      updated_at: new Date().toISOString(),
      deleted: false
    }

    const updatedMemos = [newMemo, ...memos]
    const updatedMemoOrder = [newMemo.id, ...memoOrder]
    setMemos(updatedMemos)
    setMemoOrder(updatedMemoOrder)
    setShowCategoryMenu(null)
    showNotification(`メモを「${categories[targetCategory]?.name}」にコピーしました`)

    // 🔧 修正: 一度だけ保存（二重保存を防止）
    await saveMemos(updatedMemos, updatedMemoOrder)
  }

  // 通知を表示
  const showNotification = (message: string) => {
    // 簡単な通知実装
    alert(message)
  }

  // ドラッグアンドドロップでメモを並び替え
  const moveMemo = async (draggedId: number, targetId: number, position: 'before' | 'after') => {
    if (isImporting || isDeleting || isSaving) {
      console.log('🚫 処理中のため移動をスキップ')
      return
    }

    console.log(`📦 移動処理開始: ${draggedId} → ${targetId} (${position})`)

    // 履歴に追加（操作前の状態を保存）
    saveToHistory(memos, memoOrder)

    const newMemoOrder = [...memoOrder]
    const draggedIndex = newMemoOrder.indexOf(draggedId)
    const targetIndex = newMemoOrder.indexOf(targetId)

    if (draggedIndex === -1 || targetIndex === -1) {
      console.log(`❌ インデックスが見つかりません: draggedIndex=${draggedIndex}, targetIndex=${targetIndex}`)
      return
    }

    console.log(`📍 元の位置: draggedIndex=${draggedIndex}, targetIndex=${targetIndex}`)

    // draggedを削除
    newMemoOrder.splice(draggedIndex, 1)

    // targetIndexを再計算（draggedを削除したので変わる可能性がある）
    const newTargetIndex = newMemoOrder.indexOf(targetId)
    const insertIndex = position === 'before' ? newTargetIndex : newTargetIndex + 1

    console.log(`📍 挿入位置: insertIndex=${insertIndex}`)

    // draggedを挿入
    newMemoOrder.splice(insertIndex, 0, draggedId)

    setMemoOrder(newMemoOrder)
    console.log(`✅ 並び順更新完了`)
    await saveMemos(memos, newMemoOrder)
  }

  // メモを1つ上に移動
  const moveUp = async (id: number) => {
    // 🔧 重要: インポート中・削除中・保存中は操作を禁止
    if (isImporting || isDeleting || isSaving) {
      console.log('🚫 処理中のため移動をスキップ')
      return
    }

    const currentIndex = filteredMemos.findIndex(m => m.id === id)
    if (currentIndex <= 0) return // 最上位または見つからない場合は何もしない

    // 履歴に追加（操作前の状態を保存）
    saveToHistory(memos, memoOrder)

    // フィルター済みリストでの隣接メモを取得
    const currentMemo = filteredMemos[currentIndex]
    const prevMemo = filteredMemos[currentIndex - 1]

    // 全体のmemoOrderでの位置を探す
    const currentOrderIndex = memoOrder.indexOf(currentMemo.id)
    const prevOrderIndex = memoOrder.indexOf(prevMemo.id)

    // memoOrderを入れ替え
    const newMemoOrder = [...memoOrder]
    newMemoOrder[currentOrderIndex] = prevMemo.id
    newMemoOrder[prevOrderIndex] = currentMemo.id

    setMemoOrder(newMemoOrder)
    await saveMemos(memos, newMemoOrder)
  }

  // メモを1つ下に移動
  const moveDown = async (id: number) => {
    // 🔧 重要: インポート中・削除中・保存中は操作を禁止
    if (isImporting || isDeleting || isSaving) {
      console.log('🚫 処理中のため移動をスキップ')
      return
    }

    const currentIndex = filteredMemos.findIndex(m => m.id === id)
    if (currentIndex < 0 || currentIndex >= filteredMemos.length - 1) return // 最下位または見つからない場合は何もしない

    // 履歴に追加（操作前の状態を保存）
    saveToHistory(memos, memoOrder)

    // フィルター済みリストでの隣接メモを取得
    const currentMemo = filteredMemos[currentIndex]
    const nextMemo = filteredMemos[currentIndex + 1]

    // 全体のmemoOrderでの位置を探す
    const currentOrderIndex = memoOrder.indexOf(currentMemo.id)
    const nextOrderIndex = memoOrder.indexOf(nextMemo.id)

    // memoOrderを入れ替え
    const newMemoOrder = [...memoOrder]
    newMemoOrder[currentOrderIndex] = nextMemo.id
    newMemoOrder[nextOrderIndex] = currentMemo.id

    setMemoOrder(newMemoOrder)
    await saveMemos(memos, newMemoOrder)
  }

  // カテゴリを追加
  const addNewCategory = async () => {
    if (!newCategoryName.trim()) return

    const key = 'custom_' + Date.now()
    const randomIcon = availableIcons[Math.floor(Math.random() * availableIcons.length)]
    const randomColor = availableColors[Math.floor(Math.random() * availableColors.length)]

    // 🔧 修正: 更新後のデータを明示的に計算してから保存
    const updatedCategories = {
      ...categories,
      [key]: {
        name: newCategoryName.trim(),
        icon: randomIcon,
        color: randomColor
      }
    }
    const updatedCategoryOrder = [...categoryOrder, key]

    setCategories(updatedCategories)
    setCategoryOrder(updatedCategoryOrder)
    setNewCategoryName('')

    // 更新後のデータを明示的に保存
    await saveCategories(updatedCategories, updatedCategoryOrder)
  }

  // カテゴリを削除
  const deleteCategory = async (key: string) => {
    const memosInCategory = memos.filter(m => m.category === key).length

    if (memosInCategory > 0) {
      alert('このカテゴリーにはメモがあるため削除できません。')
      return
    }

    if (confirm(`"${categories[key].name}" カテゴリーを削除しますか？`)) {
      // 🔧 修正: 更新後のデータを明示的に計算してから保存
      const newCategories = { ...categories }
      delete newCategories[key]
      const newCategoryOrder = categoryOrder.filter(k => k !== key)

      setCategories(newCategories)
      setCategoryOrder(newCategoryOrder)

      if (selectedCategory === key) {
        setSelectedCategory(Object.keys(newCategories)[0])
      }

      if (currentFilter === key) {
        setCurrentFilter('all')
      }

      // 更新後のデータを明示的に保存
      await saveCategories(newCategories, newCategoryOrder)
    }
  }

  // カテゴリ名を更新（入力中）
  const updateCategoryName = (key: string, newName: string) => {
    // 入力中は空文字列も許可（全文字削除可能にする）
    const updatedCategories = {
      ...categories,
      [key]: { ...categories[key], name: newName }
    }
    setCategories(updatedCategories)
  }

  // カテゴリ名の最終確定（フォーカスが外れた時）
  const finalizeCategoryName = async (key: string) => {
    const category = categories[key]
    if (!category.name.trim()) {
      // 空の場合は元の名前に戻す（または警告を出す）
      alert('カテゴリー名は空にできません')
      // 元の名前を復元するために再読み込み
      if (user) {
        await loadDataFromSupabase(0, true)
      }
      return
    }

    // 名前をトリムして保存
    const updatedCategories = {
      ...categories,
      [key]: { ...categories[key], name: category.name.trim() }
    }
    setCategories(updatedCategories)
    await saveCategories(updatedCategories, categoryOrder)
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

    // 検索フィルター
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(m => m.text.toLowerCase().includes(query))
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
    console.log('🚀 handleImport関数が呼び出されました')
    console.log('📁 選択されたファイル:', e.target.files?.[0])

    const file = e.target.files?.[0]
    if (!file) {
      console.log('❌ ファイルが選択されていません')
      return
    }

    const reader = new FileReader()
    reader.onload = async function(event) {
      let importData: {
        memos: Memo[]
        categories: Record<string, Category>
        categoryOrder?: string[]
        memoOrder?: number[]
      } | null = null

      try {
        console.log('📂 ファイル読み込み開始')
        importData = JSON.parse(event.target?.result as string)

        if (!importData || !importData.memos || !importData.categories) {
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
          // 実際のインポート処理開始（確認後）
          setIsImporting(true)
          console.log('📂 インポート処理開始（確認済み）')
          // インポート前にバックアップを自動作成
          if (memos.length > 0) {
            console.log('インポート前のデータをバックアップ中...')
            exportData() // 現在のデータを自動バックアップ
          }

          // データを更新（deleted属性を明示的に設定）
          console.log('📥 インポートデータ詳細:')
          console.log(`元データ件数: ${importData.memos?.length || 0}`)

          const processedMemos = (importData.memos || []).map((memo: Memo, index: number) => {
            const processed = {
              ...memo,
              deleted: memo.deleted === true ? true : false, // 明示的にfalseを設定
              updated_at: memo.updated_at || new Date().toISOString()
            }

            // 最初の5件を詳細ログ
            if (index < 5) {
              console.log(`メモ${index + 1}:`, {
                id: processed.id,
                textLength: processed.text?.length || 0,
                category: processed.category,
                deleted: processed.deleted
              })
            }

            return processed
          })

          console.log(`処理後件数: ${processedMemos.length}`)

          // ID重複チェック
          const ids = processedMemos.map((m: Memo) => m.id)
          const uniqueIds = new Set(ids)
          console.log(`ユニークID数: ${uniqueIds.size}`)
          if (ids.length !== uniqueIds.size) {
            console.warn('⚠️ インポートデータにID重複あり!')
            const duplicateIds = ids.filter((id: number, index: number) => ids.indexOf(id) !== index)
            console.log('重複ID:', [...new Set(duplicateIds)])
          }

          setMemos(processedMemos)
          setCategories(importData.categories || {})
          setCategoryOrder(importData.categoryOrder || Object.keys(importData.categories))
          setMemoOrder(importData.memoOrder || processedMemos.map((m: Memo) => m.id))

          if (!importData.categories[selectedCategory]) {
            setSelectedCategory(Object.keys(importData.categories)[0])
          }

          // まずReact Stateを更新（await不要）
          console.log('🔄 React Stateを更新中...')

          // LocalStorageに保存（非同期関数を適切にawait）
          // 🔧 修正: インポートしたデータを明示的に渡す
          console.log('💾 LocalStorageに保存中...')
          await saveMemos(processedMemos, importData.memoOrder || processedMemos.map((m: Memo) => m.id))
          await saveCategories(importData.categories, importData.categoryOrder || Object.keys(importData.categories))

          console.log('✅ LocalStorage保存完了')

          // Supabaseに保存（最新のStateを使用）
          try {
            // 🔧 重要: インポート時は既存データを全削除してから新規データを保存
            console.log('🗑️ 既存データを削除中...')
            await dataService.deleteAllUserData()

            console.log(`📤 ${processedMemos.length}件のメモをSupabaseに緊急保存中...`)

            // 強制的に全データを上書き保存（deleted属性を明示的に設定）
            await dataService.saveMemos(processedMemos)

            // メモ順序も保存
            const memoOrderToSave = importData.memoOrder || importData.memos.map((m: Memo) => m.id)
            await dataService.saveMemoOrder(memoOrderToSave)

            // カテゴリーも保存
            await dataService.saveCategories(importData.categories, importData.categoryOrder || Object.keys(importData.categories))

            console.log('Supabaseへの緊急保存完了')
            alert(`✅ データをインポートしました！\n${importData.memos.length}件のデータをクラウドに緊急保存完了\n\n※これでクラウドが最新状態になりました`)
          } catch (error) {
            console.error('Supabase緊急保存エラー:', error)
            alert(`⚠️ データをインポートしました！\nローカルに保存済み\n\nクラウド保存エラー: ${(error as Error).message}\n\n手動で同期ボタンを押してください`)
          } finally {
            // インポート処理完了
            setIsImporting(false)
            console.log('📂 インポート処理完了')
          }
        } else {
          console.log('📂 インポートがキャンセルされました')
        }
      } catch (error) {
        console.error('❌ インポートエラー:', error)
        alert('インポートに失敗しました。\n\n' + (error as Error).message)
      } finally {
        // 必ずフラグをリセット
        setIsImporting(false)
        console.log('📂 インポート処理終了')
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
      {/* ヘッダー：画面切り替えボタン付き */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <h1 style={{ margin: 0 }}>
          {viewMode === 'quick' ? 'クイックメモ 📝' : 'ツリー管理 🌲'}
        </h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setViewMode('quick')}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              borderRadius: '6px',
              border: viewMode === 'quick' ? '2px solid #3b82f6' : '1px solid #ddd',
              backgroundColor: viewMode === 'quick' ? '#eff6ff' : 'white',
              color: viewMode === 'quick' ? '#3b82f6' : '#666',
              cursor: 'pointer',
              fontWeight: viewMode === 'quick' ? 'bold' : 'normal'
            }}
          >
            📝 クイックメモ
          </button>
          <button
            onClick={() => setViewMode('tree')}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              borderRadius: '6px',
              border: viewMode === 'tree' ? '2px solid #10b981' : '1px solid #ddd',
              backgroundColor: viewMode === 'tree' ? '#f0fdf4' : 'white',
              color: viewMode === 'tree' ? '#10b981' : '#666',
              cursor: 'pointer',
              fontWeight: viewMode === 'tree' ? 'bold' : 'normal'
            }}
          >
            🌲 ツリー管理
          </button>
        </div>
      </div>

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

      {/* クイックメモ画面 */}
      {viewMode === 'quick' && (
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
              <div className="action-group-1">
                <button className="manage-btn" onClick={() => setShowCategoryModal(true)} title="カテゴリー管理">
                  <span className="btn-icon">⚙️</span>
                  <span className="btn-label">管理</span>
                </button>
                {user ? (
                  <button
                    className="manage-btn"
                    onClick={async () => {
                      await authService.signOut()
                      alert('ログアウトしました')
                    }}
                    title="ログアウト"
                  >
                    <span className="btn-icon">👤</span>
                    <span className="btn-label">ログアウト</span>
                  </button>
                ) : (
                  <button
                    className="manage-btn"
                    onClick={() => setShowAuthModal(true)}
                    title="ログイン・アカウント作成"
                  >
                    <span className="btn-icon">🔒</span>
                    <span className="btn-label">ログイン</span>
                  </button>
                )}
                <button className="export-btn" onClick={exportData} title="データをエクスポート">
                  <span className="btn-icon">💾</span>
                  <span className="btn-label">保存</span>
                </button>
                <button className="import-btn" onClick={() => {
                console.log('📂 インポートボタンがクリックされました')
                console.log('📁 inputRef:', importInputRef.current)
                console.log('📁 inputRef.value (リセット前):', importInputRef.current?.value)
                // 🔧 重要: valueをリセットして同じファイルの再選択を可能にする
                if (importInputRef.current) {
                  importInputRef.current.value = ''
                  console.log('✅ input.value をリセットしました')
                }
                console.log('📁 inputRef.value (リセット後):', importInputRef.current?.value)
                console.log('🖱️ input.click() を実行します')
                // 🔧 修正: ファイル選択ダイアログが開いている間、フォーカスイベントを無視
                isSelectingFileRef.current = true
                console.log('🚩 ファイル選択フラグを立てました')
                importInputRef.current?.click()
              }} title="データをインポート">
                <span className="btn-icon">📂</span>
                <span className="btn-label">復元</span>
              </button>
              <input
                type="file"
                ref={importInputRef}
                className="import-input"
                accept=".json"
                onChange={(e) => {
                  console.log('🔔 onChange イベントが発火しました!', e.target.files)
                  isSelectingFileRef.current = false
                  console.log('✅ ファイル選択フラグをクリアしました（onChange）')
                  handleImport(e)
                }}
                onClick={() => {
                  console.log('🖱️ input要素がクリックされました')
                  // ファイル選択ダイアログが開いた後、キャンセルまたは選択完了時にフラグをクリア
                  // onClickは実際にはダイアログを開く前に発火するため、ここでは何もしない
                }}
                onBlur={() => {
                  // ダイアログが閉じられた（キャンセルまたは選択完了）
                  console.log('🔚 input要素からフォーカスが外れました（ダイアログ終了）')
                  isSelectingFileRef.current = false
                  console.log('✅ ファイル選択フラグをクリアしました（onBlur）')
                }}
              />
              </div>
              <div className="action-group-2">
                <button
                  className="manage-btn"
                  onClick={undo}
                  disabled={historyIndex <= 0}
                  title="元に戻す"
                >
                  <span className="btn-icon">↶</span>
                  <span className="btn-label">戻る</span>
                </button>
                <button
                  className="manage-btn"
                  onClick={redo}
                  disabled={historyIndex >= history.length - 1}
                  title="やり直す"
                >
                  <span className="btn-icon">↷</span>
                  <span className="btn-label">進む</span>
                </button>
              </div>
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
            onFocus={() => {
              memoInputFocusedRef.current = true
            }}
            onBlur={() => {
              memoInputFocusedRef.current = false
            }}
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
        <div className="show-completed">
          <input
            type="checkbox"
            id="showCompleted"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
          />
          <label htmlFor="showCompleted">完了したメモも表示</label>
        </div>
      </div>

      <div className="sort-search-wrapper">
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
        <div className="search-wrapper">
          <label className="search-label">🔍</label>
          <input
            type="text"
            className="search-input"
            placeholder="検索..."
            value={searchQuery}
            onChange={(e) => {
              const newValue = e.target.value
              setSearchQuery(newValue)

              // 検索テキストが空になった場合は画面固定を解除
              if (!newValue && window.innerWidth <= 600 && isSearchFocusedRef.current) {
                isSearchFocusedRef.current = false
                const scrollY = searchScrollPositionRef.current

                document.body.style.overflow = ''
                document.body.style.position = ''
                document.body.style.width = ''
                document.body.style.top = ''

                window.scrollTo(0, scrollY)
              }
              // 入力中は固定状態を維持（スクロール操作は不要）
              else if (isSearchFocusedRef.current && window.innerWidth <= 600) {
                // position: fixedが維持されているか確認し、必要なら再適用
                if (document.body.style.position !== 'fixed') {
                  document.body.style.overflow = 'hidden'
                  document.body.style.position = 'fixed'
                  document.body.style.width = '100%'
                  document.body.style.top = `-${searchScrollPositionRef.current}px`
                }
              }
            }}
            onTouchStart={() => {
              // スマホ版: タッチした瞬間に固定（フォーカスより前）
              if (window.innerWidth <= 600 && !isSearchFocusedRef.current) {
                isSearchFocusedRef.current = true

                // 現在のスクロール位置を保存
                searchScrollPositionRef.current = window.scrollY || document.documentElement.scrollTop

                // bodyを即座に固定
                document.body.style.overflow = 'hidden'
                document.body.style.position = 'fixed'
                document.body.style.width = '100%'
                document.body.style.top = `-${searchScrollPositionRef.current}px`
              }
            }}
            onFocus={() => {
              // PC版やタッチ以外の場合用のフォールバック
              if (window.innerWidth <= 600 && !isSearchFocusedRef.current) {
                isSearchFocusedRef.current = true

                // 現在のスクロール位置を保存
                searchScrollPositionRef.current = window.scrollY || document.documentElement.scrollTop

                // bodyを即座に固定
                document.body.style.overflow = 'hidden'
                document.body.style.position = 'fixed'
                document.body.style.width = '100%'
                document.body.style.top = `-${searchScrollPositionRef.current}px`
              }
            }}
            onBlur={() => {
              // スクロールを再度有効化
              if (window.innerWidth <= 600) {
                isSearchFocusedRef.current = false
                const scrollY = searchScrollPositionRef.current

                document.body.style.overflow = ''
                document.body.style.position = ''
                document.body.style.width = ''
                document.body.style.top = ''

                // スクロール位置を復元
                window.scrollTo(0, scrollY)
              }
            }}
          />
          {searchQuery && (
            <button
              className="search-clear"
              onClick={() => {
                setSearchQuery('')
                // 検索クリア時に画面固定を解除
                if (window.innerWidth <= 600 && isSearchFocusedRef.current) {
                  isSearchFocusedRef.current = false
                  const scrollY = searchScrollPositionRef.current

                  document.body.style.overflow = ''
                  document.body.style.position = ''
                  document.body.style.width = ''
                  document.body.style.top = ''

                  window.scrollTo(0, scrollY)
                }
              }}
              title="クリア"
            >
              ✕
            </button>
          )}
        </div>
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
                className={`memo-item ${memo.completed ? 'completed' : ''} ${isManualSort ? 'manual-sort' : ''} ${dragOverMemoId === memo.id ? 'drag-over' : ''}`}
                data-memo-id={memo.id}
                draggable={isManualSort && editingMemo !== memo.id}
                onDragStart={(e) => {
                  if (!isManualSort) return
                  e.dataTransfer.effectAllowed = 'move'
                  setDraggedMemoId(memo.id)
                }}
                onDragOver={(e) => {
                  if (!isManualSort || draggedMemoId === null || draggedMemoId === memo.id) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDragOverMemoId(memo.id)
                }}
                onDragLeave={() => {
                  setDragOverMemoId(null)
                }}
                onDrop={(e) => {
                  if (!isManualSort || draggedMemoId === null || draggedMemoId === memo.id) return
                  e.preventDefault()

                  // ドロップ位置を判定（上半分か下半分か）
                  const rect = e.currentTarget.getBoundingClientRect()
                  const mouseY = e.clientY
                  const position = mouseY < rect.top + rect.height / 2 ? 'before' : 'after'

                  console.log(`🖱️ ドロップ: ${draggedMemoId} → ${memo.id} (${position})`)
                  moveMemo(draggedMemoId, memo.id, position)
                  setDraggedMemoId(null)
                  setDragOverMemoId(null)
                }}
                onDragEnd={() => {
                  setDraggedMemoId(null)
                  setDragOverMemoId(null)
                }}
              >
                {isManualSort && (
                  <div
                    className="drag-handle-area"
                    onTouchStart={(e) => {
                      if (editingMemo === memo.id) return
                      e.stopPropagation()

                      const startY = e.touches[0].clientY
                      setTouchStartY(startY)
                      setIsLongPressActive(false)
                      console.log(`📱 タッチ開始: Y=${startY}, memo=${memo.id}`)

                      // 長押し検出（300ms）
                      longPressTimerRef.current = setTimeout(() => {
                        setIsLongPressActive(true)
                        setDraggedMemoId(memo.id)
                        setIsDraggingTouch(true)
                        console.log(`📱 ✅ 長押し検出成功: ドラッグ開始 (${memo.id})`)

                        // 振動フィードバック（対応ブラウザのみ）
                        if (navigator.vibrate) {
                          navigator.vibrate(50)
                        }
                      }, 300)
                      console.log(`📱 タイマー開始: 300ms`)
                    }}
                    onTouchMove={(e) => {
                      // 長押しが確定していない場合
                      if (!isLongPressActive) {
                        // 少し動いたら長押しキャンセル（スクロールを許可）
                        const touch = e.touches[0]
                        const moveDistance = Math.abs(touch.clientY - touchStartY)
                        console.log(`📱 タッチ移動: 移動距離=${moveDistance.toFixed(1)}px, 長押し=${isLongPressActive ? '有効' : '無効'}`)
                        if (moveDistance > 10) {
                          if (longPressTimerRef.current) {
                            console.log(`📱 ❌ 長押しキャンセル: 移動距離=${moveDistance.toFixed(1)}px > 10px`)
                            clearTimeout(longPressTimerRef.current)
                            longPressTimerRef.current = null
                          }
                        }
                        return
                      }

                      // ドラッグ中のみスクロール防止
                      if (draggedMemoId === null || !isDraggingTouch) return
                      e.preventDefault()
                      e.stopPropagation()

                      const touch = e.touches[0]
                      const element = document.elementFromPoint(touch.clientX, touch.clientY)
                      const memoItem = element?.closest('.memo-item') as HTMLElement

                      if (memoItem) {
                        const targetMemoId = parseInt(memoItem.getAttribute('data-memo-id') || '0')
                        if (targetMemoId && targetMemoId !== draggedMemoId) {
                          setDragOverMemoId(targetMemoId)
                        }
                      }
                    }}
                    onTouchEnd={(e) => {
                      console.log(`📱 タッチ終了: 長押し=${isLongPressActive ? '有効' : '無効'}`)

                      // 長押しタイマーをクリア
                      if (longPressTimerRef.current) {
                        console.log(`📱 タイマークリア（タッチ終了）`)
                        clearTimeout(longPressTimerRef.current)
                        longPressTimerRef.current = null
                      }

                      // 長押しが確定していない場合は何もしない（通常のタップ）
                      if (!isLongPressActive) {
                        console.log(`📱 長押し未確定のため処理スキップ`)
                        setIsLongPressActive(false)
                        return
                      }

                      console.log(`📱 ドロップ処理開始: draggedMemoId=${draggedMemoId}, isDraggingTouch=${isDraggingTouch}`)

                      if (draggedMemoId === null || !isDraggingTouch) {
                        console.log(`📱 ❌ ドロップ条件不足: draggedMemoId=${draggedMemoId}, isDraggingTouch=${isDraggingTouch}`)
                        setDraggedMemoId(null)
                        setDragOverMemoId(null)
                        setIsDraggingTouch(false)
                        setIsLongPressActive(false)
                        return
                      }

                      e.stopPropagation()

                      const touch = e.changedTouches[0]
                      const element = document.elementFromPoint(touch.clientX, touch.clientY)
                      const memoItem = element?.closest('.memo-item') as HTMLElement

                      console.log(`📱 ドロップ位置検出: element=${!!element}, memoItem=${!!memoItem}`)

                      if (memoItem) {
                        const targetMemoId = parseInt(memoItem.getAttribute('data-memo-id') || '0')
                        console.log(`📱 ターゲット検出: targetMemoId=${targetMemoId}, draggedMemoId=${draggedMemoId}`)

                        if (targetMemoId && targetMemoId !== draggedMemoId) {
                          // ドロップ位置を判定（上半分か下半分か）
                          const rect = memoItem.getBoundingClientRect()
                          const touchY = touch.clientY
                          const position = touchY < rect.top + rect.height / 2 ? 'before' : 'after'

                          console.log(`📱 ✅ タッチドロップ実行: ${draggedMemoId} → ${targetMemoId} (${position})`)
                          moveMemo(draggedMemoId, targetMemoId, position)
                        } else {
                          console.log(`📱 ❌ 同じメモまたは無効なターゲット`)
                        }
                      } else {
                        console.log(`📱 ❌ メモアイテムが見つかりません`)
                      }

                      setDraggedMemoId(null)
                      setDragOverMemoId(null)
                      setIsDraggingTouch(false)
                      setIsLongPressActive(false)
                    }}
                    onTouchCancel={() => {
                      console.log(`📱 タッチキャンセル`)
                      // 長押しタイマーをクリア
                      if (longPressTimerRef.current) {
                        console.log(`📱 タイマークリア（タッチキャンセル）`)
                        clearTimeout(longPressTimerRef.current)
                        longPressTimerRef.current = null
                      }
                      setDraggedMemoId(null)
                      setDragOverMemoId(null)
                      setIsDraggingTouch(false)
                      setIsLongPressActive(false)
                    }}
                  >
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
                      {currentSort === 'manual' && (
                        <>
                          <button
                            className="action-btn move-up-btn"
                            onClick={() => moveUp(memo.id)}
                            title="1つ上に移動"
                            disabled={filteredMemos.findIndex(m => m.id === memo.id) === 0}
                          >
                            ↑
                          </button>
                          <button
                            className="action-btn move-down-btn"
                            onClick={() => moveDown(memo.id)}
                            title="1つ下に移動"
                            disabled={filteredMemos.findIndex(m => m.id === memo.id) === filteredMemos.length - 1}
                          >
                            ↓
                          </button>
                        </>
                      )}
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
      </div>
      )}

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

      {/* ツリー管理画面（新しいアウトライナー形式） */}
      {viewMode === 'tree' && (
        <div style={{ padding: '10px 5px 15px 5px', backgroundColor: '#f9fafb', borderRadius: '8px', minHeight: '400px' }}>
          <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingLeft: '5px', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: '18px', color: '#374151', lineHeight: '1.3' }}>構造化ツリー</h2>
              <p style={{ margin: '3px 0 0 0', fontSize: '10px', color: '#666', lineHeight: '1.3' }}>
                <span style={{ display: 'inline-block' }}>Shift+Enter: 新規</span>
                <span style={{ display: 'inline-block', margin: '0 2px' }}> / </span>
                <span style={{ display: 'inline-block' }}>Tab: 下層</span>
              </p>
            </div>
            <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
              <button
                onClick={undoTree}
                disabled={treeHistoryIndex <= 0}
                style={{
                  padding: '5px 8px',
                  fontSize: '12px',
                  backgroundColor: treeHistoryIndex <= 0 ? '#d1d5db' : '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: treeHistoryIndex <= 0 ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  lineHeight: '1.2'
                }}
                title="戻る"
              >
                ↶
              </button>
              <button
                onClick={redoTree}
                disabled={treeHistoryIndex >= treeHistory.length - 1}
                style={{
                  padding: '5px 8px',
                  fontSize: '12px',
                  backgroundColor: treeHistoryIndex >= treeHistory.length - 1 ? '#d1d5db' : '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: treeHistoryIndex >= treeHistory.length - 1 ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  lineHeight: '1.2'
                }}
                title="進む"
              >
                ↷
              </button>
              <button
                onClick={() => setShowTemplateModal(true)}
                style={{
                  padding: '5px 8px',
                  fontSize: '12px',
                  backgroundColor: '#6366f1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  lineHeight: '1.2'
                }}
              >
                ⚙️
              </button>
              <button
                onClick={() => addTreeNode(null, undefined, 0)}
                style={{
                  padding: '5px 8px',
                  fontSize: '12px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  lineHeight: '1.2'
                }}
              >
                ➕
              </button>
            </div>
          </div>

          {/* ツリーノードの表示（再帰的） */}
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '6px 5px 10px 5px', minHeight: '300px' }}>
            {treeNodes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#999' }}>
                <div style={{ fontSize: '48px', marginBottom: '10px' }}>🌲</div>
                <p style={{ fontSize: '16px' }}>まだ項目がありません</p>
                <p style={{ fontSize: '14px' }}>「大項目を追加」ボタンから始めましょう</p>
              </div>
            ) : (
              <div>
                {/* フラット配列のツリーノード表示 */}
                {(() => {
                  const renderNode = (node: TreeNode, index: number) => {
                    const nodeLevel = node.level || 0
                    // 次のノードが子要素かチェック
                    const nextNode = treeNodes[index + 1]
                    const hasChildren = nextNode && nextNode.level > nodeLevel
                    const isCollapsed = node.collapsed

                    return (
                      <div key={node.id} style={{ marginBottom: '2px' }}>
                        {/* Tree node with base indent */}
                        <div
                          draggable={editingNodeId !== node.id}
                          onDragStart={(e) => {
                            if (editingNodeId === node.id) {
                              e.preventDefault()
                              return
                            }
                            setDraggedNodeId(node.id)
                            e.dataTransfer.effectAllowed = 'move'
                          }}
                          onDragOver={(e) => {
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'move'
                            setDragOverNodeId(node.id)
                          }}
                          onDragLeave={() => {
                            setDragOverNodeId(null)
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            if (draggedNodeId && draggedNodeId !== node.id) {
                              // ドロップ位置を判定（上半分なら before、下半分なら after）
                              const rect = e.currentTarget.getBoundingClientRect()
                              const midpoint = rect.top + rect.height / 2
                              const position = e.clientY < midpoint ? 'before' : 'after'
                              moveTreeNode(draggedNodeId, node.id, position)
                            }
                            setDraggedNodeId(null)
                            setDragOverNodeId(null)
                          }}
                          onDragEnd={() => {
                            setDraggedNodeId(null)
                            setDragOverNodeId(null)
                          }}
                          style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '6px 8px 6px 4px',
                          paddingLeft: `${10 + nodeLevel * 20}px`,
                          backgroundColor: editingNodeId === node.id ? '#f0f9ff' : (dragOverNodeId === node.id ? '#fef3c7' : 'transparent'),
                          borderRadius: '4px',
                          borderLeft: nodeLevel > 0 ? '2px solid #e5e7eb' : 'none',
                          marginLeft: nodeLevel > 0 ? '8px' : '10px',
                          cursor: editingNodeId === node.id ? 'text' : 'move',
                          opacity: draggedNodeId === node.id ? 0.5 : 1
                        }}>
                          {/* テンプレート名 + テキスト部分 */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            flex: '1 1 300px',
                            minWidth: '200px'
                          }}>
                          {/* 折りたたみボタン */}
                          <button
                            onClick={() => {
                              if (hasChildren) {
                                updateTreeNode(node.id, { collapsed: !node.collapsed })
                              }
                            }}
                            style={{
                              marginRight: '6px',
                              padding: '1px 3px',
                              fontSize: '10px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              cursor: hasChildren ? 'pointer' : 'default',
                              minWidth: '16px',
                              color: hasChildren ? '#374151' : '#d1d5db',
                              fontWeight: 'bold',
                              lineHeight: '1'
                            }}
                          >
                            {hasChildren ? (isCollapsed ? '+' : '-') : '-'}
                          </button>

                          {/* 大項目名（左側に表示） */}
                          {(() => {
                            // templateTypeでテンプレートを検索、見つからない場合はnodeLevel基準
                            const template = treeTemplates.find(t => t.id === node.templateType) || treeTemplates[nodeLevel] || treeTemplates[0]
                            return template ? (
                              <span
                                style={{
                                  marginRight: '6px',
                                  color: template.color || '#374151',
                                  fontSize: '13px',
                                  fontWeight: 'bold',
                                  minWidth: '80px',
                                  maxWidth: '120px',
                                  flexShrink: 0,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {`【${template.name}】`}
                              </span>
                            ) : null
                          })()}

                          {/* テキスト入力/表示 */}
                          {editingNodeId === node.id ? (
                            <textarea
                              value={node.text}
                              onChange={(e) => {
                                updateTreeNode(node.id, { text: e.target.value })
                                // 高さを自動調整
                                e.target.style.height = 'auto'
                                e.target.style.height = e.target.scrollHeight + 'px'
                              }}
                              onBlur={() => setEditingNodeId(null)}
                              onKeyDown={(e) => {
                                // IME変換中のEnterは無視
                                if (e.nativeEvent.isComposing) return

                                if (e.key === 'Enter') {
                                  if (e.shiftKey) {
                                    // Shift+Enter: 同じ大項目テンプレートの新しい項目を同じレベルに追加
                                    e.preventDefault()
                                    setEditingNodeId(null)
                                    const currentNodeTemplateIndex = treeTemplates.findIndex(t => t.id === node.templateType)
                                    const sameIndex = currentNodeTemplateIndex >= 0 ? currentNodeTemplateIndex : 0
                                    addSiblingAfterNode(node.id, sameIndex)
                                  } else if (e.altKey) {
                                    // Option+Enter: 改行を許可（デフォルト動作）
                                    return
                                  } else {
                                    // 通常のEnter: 編集完了
                                    e.preventDefault()
                                    setEditingNodeId(null)
                                  }
                                } else if (e.key === 'Tab') {
                                  e.preventDefault()
                                  e.stopPropagation()

                                  if (e.shiftKey) {
                                    // Shift+Tab: 現在の行の階層を上げる（アンインデント）
                                    if (nodeLevel > 0) {
                                      unindentTreeNode(node.id)
                                    }
                                  } else {
                                    // Tab: 現在の行の階層を下げる（インデント）
                                    if (nodeLevel < treeTemplates.length - 1) {
                                      indentTreeNode(node.id)
                                    }
                                  }
                                }
                              }}
                              onInput={(e) => {
                                // 高さを自動調整
                                const target = e.target as HTMLTextAreaElement
                                target.style.height = 'auto'
                                target.style.height = target.scrollHeight + 'px'
                              }}
                              autoFocus
                              placeholder="入力してください (Enter: 完了, Option+Enter: 改行, Shift+Enter: 次の項目)"
                              style={{
                                flex: 1,
                                padding: '3px 6px',
                                fontSize: '13px',
                                color: '#374151',
                                fontWeight: 'normal',
                                border: '1px solid #3b82f6',
                                borderRadius: '3px',
                                resize: 'none',
                                overflow: 'hidden',
                                minHeight: '26px',
                                lineHeight: '1.5',
                                fontFamily: 'inherit'
                              }}
                            />
                          ) : (
                            <div
                              onClick={() => setEditingNodeId(node.id)}
                              style={{
                                flex: 1,
                                cursor: 'pointer',
                                color: '#374151',
                                fontSize: '13px',
                                fontWeight: 'normal',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word'
                              }}
                            >
                              {node.text || '（空白）'}
                            </div>
                          )}
                          </div>

                          {/* 操作ボタン（PC: 同じ行、スマホ: 折り返し） */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                            flexShrink: 0
                          }}>
                          {/* 階層操作ボタン */}
                          {nodeLevel > 0 && (
                            <button
                              onClick={() => unindentTreeNode(node.id)}
                              style={{
                                padding: '1px 4px',
                                fontSize: '12px',
                                backgroundColor: '#fef3c7',
                                border: '1px solid #fcd34d',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                lineHeight: '1',
                                flexShrink: 0
                              }}
                              title="階層を上げる"
                            >
                              ←
                            </button>
                          )}
                          {nodeLevel < treeTemplates.length - 1 && (
                            <button
                              onClick={() => indentTreeNode(node.id)}
                              style={{
                                padding: '1px 4px',
                                fontSize: '12px',
                                backgroundColor: '#dbeafe',
                                border: '1px solid #93c5fd',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                lineHeight: '1',
                                flexShrink: 0
                              }}
                              title="階層を下げる"
                            >
                              →
                            </button>
                          )}

                          {/* クイックメモ挿入ボタン */}
                          <button
                            onClick={() => setShowMemoPickerFor(node.id)}
                            style={{
                              padding: '1px 4px',
                              fontSize: '12px',
                              backgroundColor: '#eff6ff',
                              border: '1px solid #bfdbfe',
                              borderRadius: '3px',
                              cursor: 'pointer',
                              lineHeight: '1',
                              flexShrink: 0
                            }}
                            title="メモ挿入"
                          >
                            📝
                          </button>

                          {/* 説明ボタン */}
                          <button
                            onClick={() => updateTreeNode(node.id, { showDescription: !node.showDescription })}
                            style={{
                              padding: '1px 4px',
                              fontSize: '12px',
                              backgroundColor: node.showDescription ? '#dcfce7' : '#f3f4f6',
                              border: `1px solid ${node.showDescription ? '#86efac' : '#d1d5db'}`,
                              borderRadius: '3px',
                              cursor: 'pointer',
                              lineHeight: '1',
                              flexShrink: 0
                            }}
                            title="説明"
                          >
                            💬
                          </button>

                          {/* 削除ボタン */}
                          <button
                            onClick={() => deleteTreeNode(node.id)}
                            style={{
                              padding: '1px 4px',
                              fontSize: '12px',
                              backgroundColor: '#fee',
                              border: '1px solid #fcc',
                              borderRadius: '3px',
                              cursor: 'pointer',
                              lineHeight: '1',
                              flexShrink: 0
                            }}
                            title="削除"
                          >
                            🗑️
                          </button>
                          </div>
                        </div>

                        {/* 説明欄（編集中） */}
                        {node.showDescription && (
                          <div style={{
                            paddingLeft: `${30 + nodeLevel * 20}px`,
                            paddingTop: '4px',
                            paddingBottom: '4px'
                          }}>
                            <textarea
                              value={node.description || ''}
                              onChange={(e) => {
                                updateTreeNode(node.id, { description: e.target.value })
                                // 高さを自動調整
                                e.target.style.height = 'auto'
                                e.target.style.height = e.target.scrollHeight + 'px'
                              }}
                              onKeyDown={(e) => {
                                // IME変換中のEnterは無視
                                if (e.nativeEvent.isComposing) return

                                if (e.key === 'Enter') {
                                  if (e.altKey) {
                                    // Option+Enter: 改行を許可（デフォルト動作）
                                    return
                                  } else {
                                    // 通常のEnter: 説明欄を閉じる
                                    e.preventDefault()
                                    updateTreeNode(node.id, { showDescription: false })
                                  }
                                } else if (e.key === 'Escape') {
                                  // Escキー → 説明欄を閉じる
                                  e.preventDefault()
                                  updateTreeNode(node.id, { showDescription: false })
                                }
                              }}
                              onInput={(e) => {
                                // 高さを自動調整
                                const target = e.target as HTMLTextAreaElement
                                target.style.height = 'auto'
                                target.style.height = target.scrollHeight + 'px'
                              }}
                              placeholder="この項目の説明を入力... (Enter: 閉じる, Option+Enter: 改行, Esc: 閉じる)"
                              style={{
                                width: '100%',
                                minHeight: '32px',
                                maxHeight: '200px',
                                padding: '6px 8px',
                                fontSize: '12px',
                                color: '#6b7280',
                                backgroundColor: '#f9fafb',
                                border: '1px solid #e5e7eb',
                                borderRadius: '4px',
                                resize: 'none',
                                fontFamily: 'inherit',
                                overflow: 'hidden',
                                lineHeight: '1.5'
                              }}
                              autoFocus
                            />
                          </div>
                        )}

                        {/* 説明の表示（閉じている時） */}
                        {!node.showDescription && node.description && (
                          <div style={{
                            paddingLeft: `${30 + nodeLevel * 20}px`,
                            paddingTop: '4px',
                            paddingBottom: '4px'
                          }}>
                            <div
                              onClick={() => updateTreeNode(node.id, { showDescription: true })}
                              style={{
                                width: '100%',
                                minHeight: '32px',
                                padding: '6px 8px',
                                fontSize: '12px',
                                color: '#6b7280',
                                backgroundColor: '#f9fafb',
                                border: '1px solid #e5e7eb',
                                borderRadius: '4px',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                cursor: 'pointer',
                                lineHeight: '1.5',
                                fontFamily: 'inherit',
                                boxSizing: 'border-box'
                              }}
                              title="クリックして編集"
                            >
                              {node.description}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  }

                  // フラットな配列を表示（折りたたみを考慮してスキップ）
                  const result = []
                  for (let i = 0; i < treeNodes.length; i++) {
                    result.push(renderNode(treeNodes[i], i))
                    // 折りたたまれている場合は子要素（levelが大きい連続したノード）をスキップ
                    if (treeNodes[i].collapsed) {
                      const currentLevel = treeNodes[i].level || 0
                      while (i + 1 < treeNodes.length && (treeNodes[i + 1].level || 0) > currentLevel) {
                        i++
                      }
                    }
                  }
                  return <>{result}</>
                })()}
              </div>
            )}
          </div>

        </div>
      )}

      {/* クイックメモピッカーモーダル */}
      {showMemoPickerFor && (
        <div className="modal active">
          <div className="modal-content" style={{ maxWidth: '600px', maxHeight: '80vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h3 className="modal-title">クイックメモから挿入</h3>
              <button
                onClick={() => setShowMemoPickerFor(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#666'
                }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: '20px' }}>
              <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>
                挿入したいメモを選択してください
              </p>

              {/* カテゴリー別にメモを表示 */}
              {orderedCategories.map(([categoryKey, category]) => {
                const categoryMemos = memos.filter(m => m.category === categoryKey && !m.deleted)
                if (categoryMemos.length === 0) return null

                const isCategoryCollapsed = collapsedCategories.has(categoryKey)

                return (
                  <div key={categoryKey} style={{ marginBottom: '15px', border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
                    <div
                      onClick={() => {
                        const newCollapsed = new Set(collapsedCategories)
                        if (isCategoryCollapsed) {
                          newCollapsed.delete(categoryKey)
                        } else {
                          newCollapsed.add(categoryKey)
                        }
                        setCollapsedCategories(newCollapsed)
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '12px',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        color: '#374151',
                        backgroundColor: '#f9fafb',
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                    >
                      <span style={{ marginRight: '8px', fontSize: '12px', fontWeight: 'bold' }}>
                        {isCategoryCollapsed ? '+' : '-'}
                      </span>
                      {category.icon} {category.name} ({categoryMemos.length})
                    </div>
                    {!isCategoryCollapsed && (
                      <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {categoryMemos.map(memo => (
                          <button
                            key={memo.id}
                            onClick={() => {
                              // メモのテキストを現在のノードに挿入
                              updateTreeNode(showMemoPickerFor, { text: memo.text })
                              setShowMemoPickerFor(null)
                            }}
                            style={{
                              textAlign: 'left',
                              padding: '10px 12px',
                              fontSize: '14px',
                              backgroundColor: '#fff',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'background-color 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#eff6ff'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#fff'
                            }}
                          >
                            {memo.text}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {memos.filter(m => !m.deleted).length === 0 && (
                <p style={{ fontSize: '14px', color: '#999', textAlign: 'center', padding: '20px' }}>
                  メモがありません
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 大項目設定モーダル */}
      {showTemplateModal && (
        <div className="modal active">
          <div className="modal-content" style={{ maxWidth: '700px', maxHeight: '80vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h3 className="modal-title">大項目テンプレート設定</h3>
              <button
                onClick={() => setShowTemplateModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#666'
                }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: '20px' }}>
              <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>
                大項目テンプレートを設定します（最大10個）。Tabキーで順に切り替わります。
              </p>

              {/* テンプレート一覧 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                {treeTemplates.map((template, index) => (
                  <div key={template.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#666', minWidth: '30px' }}>
                      {index + 1}.
                    </span>
                    <input
                      type="text"
                      value={template.name}
                      onChange={(e) => {
                        const newTemplates = [...treeTemplates]
                        newTemplates[index] = { ...template, name: e.target.value }
                        setTreeTemplates(newTemplates)
                      }}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        fontSize: '14px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '4px'
                      }}
                      placeholder={`大項目 ${index + 1}`}
                    />
                    <input
                      type="color"
                      value={template.color}
                      onChange={(e) => {
                        const newTemplates = [...treeTemplates]
                        newTemplates[index] = { ...template, color: e.target.value }
                        setTreeTemplates(newTemplates)
                      }}
                      style={{
                        width: '50px',
                        height: '40px',
                        border: '2px solid #e5e7eb',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                      title="色を選択"
                    />
                    <button
                      onClick={() => {
                        setTreeTemplates(treeTemplates.filter((_, i) => i !== index))
                      }}
                      style={{
                        padding: '8px 12px',
                        fontSize: '12px',
                        backgroundColor: '#fee',
                        border: '1px solid #fcc',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      削除
                    </button>
                  </div>
                ))}
              </div>

              {/* 新しいテンプレート追加 */}
              {treeTemplates.length < 10 && (
                <button
                  onClick={() => {
                    const newTemplate: TreeTemplate = {
                      id: `template-${Date.now()}`,
                      name: `大項目 ${treeTemplates.length + 1}`,
                      order: treeTemplates.length + 1,
                      prefix: '',
                      color: templateColors[treeTemplates.length % templateColors.length]
                    }
                    setTreeTemplates([...treeTemplates, newTemplate])
                  }}
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    width: '100%'
                  }}
                >
                  ➕ 大項目を追加
                </button>
              )}

              {/* 保存ボタン */}
              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  onClick={() => setShowTemplateModal(false)}
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    backgroundColor: '#fff',
                    color: '#374151',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  キャンセル
                </button>
                <button
                  onClick={() => {
                    saveTreeData(treeNodes, treeTemplates)
                    setShowTemplateModal(false)
                  }}
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  保存
                </button>
              </div>
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
                    onBlur={() => finalizeCategoryName(key)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur() // Enterキーでフォーカスを外して確定
                      }
                    }}
                  />
                  <button
                    className="category-delete-btn"
                    onClick={() => deleteCategory(key)}
                    disabled={memosInCategory > 0}
                  >
                    削除 {memosInCategory > 0 && `(${memosInCategory})`}
                  </button>

                  {showIconPicker === key && (
                    <div className="icon-picker active">
                      {availableIcons.map(icon => (
                        <div
                          key={icon}
                          className="icon-option"
                          onClick={async () => {
                            // 🔧 修正: 更新後のデータを明示的に計算してから保存
                            const updatedCategories = {
                              ...categories,
                              [key]: { ...categories[key], icon }
                            }
                            setCategories(updatedCategories)
                            await saveCategories(updatedCategories, categoryOrder)
                            setShowIconPicker(null)
                          }}
                        >
                          {icon}
                        </div>
                      ))}
                    </div>
                  )}

                  {showColorPicker === key && (
                    <div className="color-picker active">
                      {availableColors.map(color => (
                        <div
                          key={color}
                          className="color-option"
                          style={{ backgroundColor: color }}
                          onClick={async () => {
                            // 🔧 修正: 更新後のデータを明示的に計算してから保存
                            const updatedCategories = {
                              ...categories,
                              [key]: { ...categories[key], color }
                            }
                            setCategories(updatedCategories)
                            await saveCategories(updatedCategories, categoryOrder)
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
