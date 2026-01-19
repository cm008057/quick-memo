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
  const [draggedCategoryKey, setDraggedCategoryKey] = useState<string | null>(null) // ドラッグ中のカテゴリーキー
  const [dragOverCategoryKey, setDragOverCategoryKey] = useState<string | null>(null) // ドラッグオーバー中のカテゴリーキー
  const [touchStartY, setTouchStartY] = useState<number>(0) // タッチ開始Y座標
  const [isDraggingTouch, setIsDraggingTouch] = useState<boolean>(false) // タッチドラッグ中フラグ
  const [isLongPressActive, setIsLongPressActive] = useState<boolean>(false) // 長押し検出フラグ

  // 表示モードの状態
  const [viewMode, setViewMode] = useState<'quick' | 'kanban'>('quick') // 画面切り替え（リスト or カンバン）
  const [hoveredMemoId, setHoveredMemoId] = useState<number | null>(null) // カンバンでホバー中のメモID
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null) // 展開中のカテゴリ
  const [kanbanEditingMemo, setKanbanEditingMemo] = useState<number | null>(null) // カンバンで編集中のメモID

  // 認証関連のstate
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [user, setUser] = useState<any>(null)
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default')
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
  const draggedMemoIdRef = useRef<number | null>(null) // ドラッグ中のメモID（即座に参照できるように）
  const autoScrollIntervalRef = useRef<NodeJS.Timeout | null>(null) // 自動スクロール用タイマー
  const saveDebounceTimerRef = useRef<NodeJS.Timeout | null>(null) // 保存デバウンス用タイマー

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

  // Service Workerの登録（PWA対応）
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registered:', registration.scope)
        })
        .catch((error) => {
          console.log('Service Worker registration failed:', error)
        })
    }
    
    // 通知許可の状態を確認
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission)
    }
  }, [])

  // 通知許可をリクエスト
  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert('このブラウザは通知に対応していません')
      return
    }

    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
    
    if (permission === 'granted') {
      // テスト通知を送信
      sendTestNotification()
    }
  }

  // テスト通知を送信
  const sendTestNotification = () => {
    if (Notification.permission === 'granted') {
      new Notification('クイックメモ 📝', {
        body: '通知が有効になりました！',
        icon: '/icons/icon-192.svg'
      })
    }
  }

  // リマインダー通知を送信
  const sendReminderNotification = (message: string) => {
    if (Notification.permission === 'granted') {
      new Notification('クイックメモ リマインダー', {
        body: message,
        icon: '/icons/icon-192.svg'
      })
    }
  }

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
        undo()
      }
      // Redo: Cmd+Y / Ctrl+Y
      else if (isCtrlOrCmd && e.key === 'y') {
        e.preventDefault()
        redo()
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

  // デバウンス付き保存（連打対応）
  const debouncedSaveMemos = (memosToSave: Memo[], memoOrderToSave: number[]) => {
    if (saveDebounceTimerRef.current) {
      console.log('⏱️ デバウンスタイマーをリセット')
      clearTimeout(saveDebounceTimerRef.current)
    }
    console.log('⏱️ デバウンス保存スケジュール: 500ms後に実行')
    saveDebounceTimerRef.current = setTimeout(() => {
      console.log('💾 デバウンス保存実行開始')
      saveMemos(memosToSave, memoOrderToSave)
    }, 500)
  }

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

    // UIのブロックを防ぐため、保存を遅延
    setTimeout(() => {
      console.log(`💾 保存処理開始（遅延実行）`)
      saveMemos(memos, newMemoOrder)
    }, 100)
  }

  // カテゴリーを移動
  const moveCategory = async (draggedKey: string, targetKey: string, position: 'before' | 'after') => {
    if (isImporting || isDeleting || isSaving) {
      console.log('🚫 処理中のため移動をスキップ')
      return
    }

    console.log(`📦 カテゴリー移動処理開始: ${draggedKey} → ${targetKey} (${position})`)

    const newCategoryOrder = [...categoryOrder]
    const draggedIndex = newCategoryOrder.indexOf(draggedKey)
    const targetIndex = newCategoryOrder.indexOf(targetKey)

    if (draggedIndex === -1 || targetIndex === -1) {
      console.log(`❌ インデックスが見つかりません: draggedIndex=${draggedIndex}, targetIndex=${targetIndex}`)
      return
    }

    console.log(`📍 元の位置: draggedIndex=${draggedIndex}, targetIndex=${targetIndex}`)

    // draggedを削除
    newCategoryOrder.splice(draggedIndex, 1)

    // targetIndexを再計算（draggedを削除したので変わる可能性がある）
    const newTargetIndex = newCategoryOrder.indexOf(targetKey)
    const insertIndex = position === 'before' ? newTargetIndex : newTargetIndex + 1

    console.log(`📍 挿入位置: insertIndex=${insertIndex}`)

    // draggedを挿入
    newCategoryOrder.splice(insertIndex, 0, draggedKey)

    setCategoryOrder(newCategoryOrder)
    console.log(`✅ カテゴリー並び順更新完了`)

    // UIのブロックを防ぐため、保存を遅延
    setTimeout(() => {
      console.log(`💾 カテゴリー保存処理開始（遅延実行）`)
      saveCategories(categories, newCategoryOrder)
    }, 100)
  }

  // メモを1つ上に移動
  const moveUp = (id: number) => {
    // 🔧 重要: インポート中・削除中は操作を禁止
    if (isImporting || isDeleting) {
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
    debouncedSaveMemos(memos, newMemoOrder)
  }

  // メモを1つ下に移動
  const moveDown = (id: number) => {
    // 🔧 重要: インポート中・削除中は操作を禁止
    if (isImporting || isDeleting) {
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
    debouncedSaveMemos(memos, newMemoOrder)
  }

  // メモを5つ上に移動
  const moveUp5 = (id: number) => {
    console.log(`⬆️⬆️⬆️ 🆕新コード🆕 moveUp5 called: id=${id}, selectedCategory=${selectedCategory}`)
    if (isImporting || isDeleting) {
      console.log('🚫 処理中のため移動をスキップ')
      return
    }

    saveToHistory(memos, memoOrder)

    const newMemoOrder = [...memoOrder]

    // 5回ループで順番を入れ替え
    for (let i = 0; i < 5; i++) {
      // 最新のnewMemoOrderでフィルター済みリストを再計算
      const currentFilteredMemos = newMemoOrder
        .map(memoId => memos.find(m => m.id === memoId))
        .filter((m): m is Memo => m !== undefined && (
          selectedCategory === 'all' ||
          (selectedCategory === 'uncategorized' && !m.category) ||
          m.category === selectedCategory
        ))

      const currentIndex = currentFilteredMemos.findIndex(m => m.id === id)
      console.log(`⬆️ ループ${i+1}/5: currentIndex=${currentIndex}, filteredLength=${currentFilteredMemos.length}`)

      if (currentIndex <= 0) {
        console.log(`⬆️ ループ終了: currentIndex=${currentIndex}`)
        break
      }

      // moveUpのロジックを直接実行
      const currentMemo = currentFilteredMemos[currentIndex]
      const prevMemo = currentFilteredMemos[currentIndex - 1]

      const currentOrderIndex = newMemoOrder.indexOf(currentMemo.id)
      const prevOrderIndex = newMemoOrder.indexOf(prevMemo.id)

      console.log(`⬆️ 入れ替え: ${currentMemo.id} (index=${currentOrderIndex}) ⇔ ${prevMemo.id} (index=${prevOrderIndex})`)

      newMemoOrder[currentOrderIndex] = prevMemo.id
      newMemoOrder[prevOrderIndex] = currentMemo.id
    }

    console.log(`⬆️ setMemoOrder実行`)
    setMemoOrder(newMemoOrder)
    debouncedSaveMemos(memos, newMemoOrder)
  }

  // メモを5つ下に移動
  const moveDown5 = (id: number) => {
    console.log(`⬇️⬇️⬇️ 🆕新コード🆕 moveDown5 called: id=${id}, selectedCategory=${selectedCategory}`)
    if (isImporting || isDeleting) {
      console.log('🚫 処理中のため移動をスキップ')
      return
    }

    saveToHistory(memos, memoOrder)

    const newMemoOrder = [...memoOrder]

    // 5回ループで順番を入れ替え
    for (let i = 0; i < 5; i++) {
      // 最新のnewMemoOrderでフィルター済みリストを再計算
      const currentFilteredMemos = newMemoOrder
        .map(memoId => memos.find(m => m.id === memoId))
        .filter((m): m is Memo => m !== undefined && (
          selectedCategory === 'all' ||
          (selectedCategory === 'uncategorized' && !m.category) ||
          m.category === selectedCategory
        ))

      const currentIndex = currentFilteredMemos.findIndex(m => m.id === id)
      console.log(`⬇️ ループ${i+1}/5: currentIndex=${currentIndex}, filteredLength=${currentFilteredMemos.length}`)

      if (currentIndex < 0 || currentIndex >= currentFilteredMemos.length - 1) {
        console.log(`⬇️ ループ終了: currentIndex=${currentIndex}`)
        break
      }

      // moveDownのロジックを直接実行
      const currentMemo = currentFilteredMemos[currentIndex]
      const nextMemo = currentFilteredMemos[currentIndex + 1]

      const currentOrderIndex = newMemoOrder.indexOf(currentMemo.id)
      const nextOrderIndex = newMemoOrder.indexOf(nextMemo.id)

      console.log(`⬇️ 入れ替え: ${currentMemo.id} (index=${currentOrderIndex}) ⇔ ${nextMemo.id} (index=${nextOrderIndex})`)

      newMemoOrder[currentOrderIndex] = nextMemo.id
      newMemoOrder[nextOrderIndex] = currentMemo.id
    }

    console.log(`⬇️ setMemoOrder実行`)
    setMemoOrder(newMemoOrder)
    debouncedSaveMemos(memos, newMemoOrder)
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
    const data = {
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

    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `quick-memo-backup-${new Date().toLocaleDateString('ja-JP').replace(/\//g, '-')}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    alert(`データをエクスポートしました！\n\nメモ数: ${data.stats.totalMemos}\n完了済み: ${data.stats.completedMemos}\nカテゴリー数: ${data.stats.totalCategories}`)
  }

  // シンプルなテキスト形式でメモを出力
  const exportAsText = () => {
    let output = ''
    let totalExported = 0

    // カテゴリ順に処理
    orderedCategories.forEach(([key, cat]) => {
      // このカテゴリのメモを取得（削除済み・完了済みを除外）
      const categoryMemos = memos.filter(m =>
        m.category === key && !m.deleted && !m.completed
      )

      // memoOrderに従って並び替え
      const sortedMemos = [...categoryMemos].sort((a, b) => {
        const indexA = memoOrder.indexOf(a.id)
        const indexB = memoOrder.indexOf(b.id)
        if (indexA === -1 && indexB === -1) return 0
        if (indexA === -1) return 1
        if (indexB === -1) return -1
        return indexA - indexB
      })

      // メモがある場合のみ出力
      if (sortedMemos.length > 0) {
        output += `${cat.icon} ${cat.name}\n`
        sortedMemos.forEach(memo => {
          output += `・${memo.text}\n`
          totalExported++
        })
        output += '\n'
      }
    })

    if (totalExported === 0) {
      alert('出力するメモがありません')
      return
    }

    // テキストファイルとしてダウンロード
    const blob = new Blob([output], {type: 'text/plain;charset=utf-8'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `quick-memo-${new Date().toLocaleDateString('ja-JP').replace(/\//g, '-')}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    alert(`メモを出力しました！\n\n出力件数: ${totalExported}件`)
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
            alert(`✅ データをインポートしました！\n${importData.memos.length}件のメモをクラウドに緊急保存完了\n\n※これでクラウドが最新状態になりました`)
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
          {viewMode === 'quick' ? 'クイックメモ 📝' : 'カンバン 📋'}
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
            📝 リスト
          </button>
          <button
            onClick={() => setViewMode('kanban')}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              borderRadius: '6px',
              border: viewMode === 'kanban' ? '2px solid #10b981' : '1px solid #ddd',
              backgroundColor: viewMode === 'kanban' ? '#f0fdf4' : 'white',
              color: viewMode === 'kanban' ? '#10b981' : '#666',
              cursor: 'pointer',
              fontWeight: viewMode === 'kanban' ? 'bold' : 'normal'
            }}
          >
            📋 カンバン
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
        {/* メモ入力欄（一番上） */}
        <div className="input-row" style={{ marginBottom: '16px' }}>
          <input
            type="text"
            value={memoInput}
            onChange={(e) => setMemoInput(e.target.value)}
            placeholder={`${categories[selectedCategory]?.name || 'メモ'}を入力...`}
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

        {/* 入力タグ選択セクション（コンパクト版） */}
        <div className="input-tag-section" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '8px',
          flexWrap: 'wrap'
        }}>
          {orderedCategories.map(([key, cat]) => (
            <button
              key={key}
              className={`input-category-btn ${key === selectedCategory ? 'active' : ''}`}
              data-category={key}
              style={{
                padding: '3px 10px',
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: '500',
                transition: 'all 0.15s ease',
                backgroundColor: key === selectedCategory 
                  ? cat.color 
                  : `${cat.color}20`,
                color: key === selectedCategory 
                  ? 'white' 
                  : cat.color,
                boxShadow: key === selectedCategory 
                  ? `0 1px 4px ${cat.color}40` 
                  : 'none'
              }}
              onClick={() => setSelectedCategory(key)}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>

        <div className="category-section">
          <div className="category-header">
            <div className="category-buttons" style={{ display: 'none' }}>
              {/* 入力用カテゴリボタンは上に移動したので非表示 */}
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
                <button 
                  className="export-btn" 
                  onClick={requestNotificationPermission} 
                  title={notificationPermission === 'granted' ? '通知ON' : '通知を有効にする'}
                  style={{
                    backgroundColor: notificationPermission === 'granted' ? '#dcfce7' : undefined,
                    borderColor: notificationPermission === 'granted' ? '#86efac' : undefined
                  }}
                >
                  <span className="btn-icon">{notificationPermission === 'granted' ? '🔔' : '🔕'}</span>
                  <span className="btn-label">通知</span>
                </button>
                <button className="export-btn" onClick={exportData} title="データをエクスポート">
                  <span className="btn-icon">💾</span>
                  <span className="btn-label">保存</span>
                </button>
                <button className="export-btn" onClick={exportAsText} title="シンプルなテキスト形式で出力">
                  <span className="btn-icon">📄</span>
                  <span className="btn-label">メモ出力</span>
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

      <div className="controls">
        <div className="filter-tabs">
          <button
            className={`filter-tab ${currentFilter === 'all' ? 'active' : ''}`}
            onClick={() => {
              setCurrentFilter('all')
              setSelectedCategory('all')
            }}
          >
            すべて <span>{counts.all}</span>
          </button>
          {orderedCategories.map(([key, cat]) => (
            <button
              key={key}
              className={`filter-tab ${currentFilter === key ? 'active' : ''}`}
              onClick={() => {
                setCurrentFilter(key)
                setSelectedCategory(key)
              }}
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
                className={`memo-item ${memo.completed ? 'completed' : ''} ${isManualSort ? 'manual-sort' : ''} ${dragOverMemoId === memo.id ? 'drag-over' : ''} ${draggedMemoId === memo.id && isDraggingTouch ? 'dragging-touch' : ''}`}
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
                      rows={Math.max(2, Math.ceil(editText.length / 50))}
                      autoFocus
                      onFocus={(e) => {
                        // カーソルを最後に移動
                        e.target.selectionStart = e.target.value.length
                        e.target.selectionEnd = e.target.value.length
                      }}
                      onKeyDown={(e) => {
                        // IME変換中のEnterは無視
                        if (e.nativeEvent.isComposing) return

                        if (e.key === 'Enter') {
                          if (e.shiftKey) {
                            // Shift+Enter: 改行を許可（デフォルト動作）
                            return
                          } else if (e.altKey) {
                            // Alt+Enter: 改行を許可（デフォルト動作）
                            return
                          } else {
                            // 通常のEnter: 編集完了
                            e.preventDefault()
                            saveMemoEdit(memo.id)
                          }
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
                            onClick={() => moveUp5(memo.id)}
                            title="5つ上に移動"
                            disabled={filteredMemos.findIndex(m => m.id === memo.id) === 0}
                          >
                            ⬆️
                          </button>
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
                          <button
                            className="action-btn move-down-btn"
                            onClick={() => moveDown5(memo.id)}
                            title="5つ下に移動"
                            disabled={filteredMemos.findIndex(m => m.id === memo.id) === filteredMemos.length - 1}
                          >
                            ⬇️
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

      {/* カンバンビュー */}
      {viewMode === 'kanban' && (
        <div style={{ 
          display: 'flex', 
          gap: '12px', 
          overflowX: 'auto', 
          padding: '8px 0',
          minHeight: '400px'
        }}>
          {orderedCategories.map(([categoryKey, category]) => {
            const categoryMemos = memos.filter(m => m.category === categoryKey && !m.deleted)
            const isExpanded = expandedCategory === categoryKey
            
            // 展開中のカテゴリ以外は非表示
            if (expandedCategory && !isExpanded) {
              return null
            }
            
            return (
              <div
                key={categoryKey}
                style={{
                  minWidth: isExpanded ? '100%' : '160px',
                  maxWidth: isExpanded ? '100%' : '200px',
                  flex: isExpanded ? '1' : '0 0 auto',
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: '70vh',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* カテゴリヘッダー */}
                <div 
                  onClick={() => setExpandedCategory(isExpanded ? null : categoryKey)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '8px',
                    padding: '6px 10px',
                    backgroundColor: `${category.color}20`,
                    borderRadius: '6px',
                    borderLeft: `3px solid ${category.color}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ fontSize: '14px' }}>{category.icon}</span>
                  <span style={{ 
                    fontSize: '13px', 
                    fontWeight: 'bold',
                    color: category.color,
                    flex: 1
                  }}>
                    {category.name}
                  </span>
                  <span style={{
                    fontSize: '10px',
                    color: '#6b7280',
                    backgroundColor: 'white',
                    padding: '2px 6px',
                    borderRadius: '10px'
                  }}>
                    {categoryMemos.length}
                  </span>
                  <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                    {isExpanded ? '✕' : '→'}
                  </span>
                </div>

                {/* メモリスト */}
                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  alignItems: 'stretch'
                }}>
                  {categoryMemos.length === 0 ? (
                    <div style={{
                      textAlign: 'center',
                      padding: '20px 8px',
                      color: '#9ca3af',
                      fontSize: '11px'
                    }}>
                      メモなし
                    </div>
                  ) : (
                    categoryMemos.map(memo => {
                      const isHovered = hoveredMemoId === memo.id
                      const isEditing = kanbanEditingMemo === memo.id
                      
                      return (
                        <div
                          key={memo.id}
                          style={{ position: 'relative', minHeight: '36px' }}
                        >
                          <div
                            onMouseEnter={() => setHoveredMemoId(memo.id)}
                            onMouseLeave={() => {
                              if (!isEditing) setHoveredMemoId(null)
                            }}
                            style={{
                              padding: isHovered || isExpanded ? '12px 14px' : '8px 10px',
                              backgroundColor: isHovered ? '#ffffff' : (memo.completed ? '#f3f4f6' : 'white'),
                              borderRadius: '6px',
                              fontSize: '12px',
                              lineHeight: '1.5',
                              color: memo.completed ? '#9ca3af' : '#374151',
                              textDecoration: memo.completed ? 'line-through' : 'none',
                              borderLeft: `3px solid ${category.color}`,
                              boxShadow: isHovered ? '0 8px 24px rgba(0,0,0,0.25)' : '0 1px 2px rgba(0,0,0,0.05)',
                              border: isHovered ? `2px solid ${category.color}` : '1px solid #e5e7eb',
                              boxSizing: 'border-box',
                              position: 'relative',
                              width: '100%',
                              zIndex: 1
                            }}
                          >
                          {/* 編集モード */}
                          {isEditing ? (
                            <div>
                              <textarea
                                value={memo.text}
                                onChange={(e) => {
                                  const updatedMemos = memos.map(m =>
                                    m.id === memo.id ? { ...m, text: e.target.value, updated_at: new Date().toISOString() } : m
                                  )
                                  setMemos(updatedMemos)
                                }}
                                onBlur={() => {
                                  setKanbanEditingMemo(null)
                                  saveMemos(memos)
                                }}
                                autoFocus
                                style={{
                                  width: '100%',
                                  minHeight: '60px',
                                  padding: '8px',
                                  fontSize: '12px',
                                  border: '1px solid #3b82f6',
                                  borderRadius: '4px',
                                  resize: 'vertical',
                                  fontFamily: 'inherit'
                                }}
                              />
                            </div>
                          ) : (
                            <>
                              {/* テキスト表示（常に省略） */}
                              {isExpanded ? (
                                <div style={{
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                  lineHeight: '1.6'
                                }}>
                                  {memo.text}
                                </div>
                              ) : (
                                <div style={{
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis'
                                }}>
                                  {memo.text.length > 15 ? memo.text.slice(0, 15) + '...' : memo.text}
                                </div>
                              )}
                            </>
                          )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* カンバンホバーポップアップ */}
      {viewMode === 'kanban' && hoveredMemoId && !kanbanEditingMemo && (() => {
        const hoveredMemo = memos.find(m => m.id === hoveredMemoId)
        if (!hoveredMemo) return null
        const cat = categories[hoveredMemo.category]
        
        return (
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '20px',
              width: '90%',
              maxWidth: '500px',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              border: `3px solid ${cat?.color || '#3b82f6'}`,
              zIndex: 2000
            }}
            onMouseLeave={() => setHoveredMemoId(null)}
          >
            {/* ヘッダー */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px',
              paddingBottom: '12px',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <span style={{ fontSize: '18px' }}>{cat?.icon}</span>
              <span style={{ 
                fontSize: '14px', 
                fontWeight: 'bold',
                color: cat?.color
              }}>
                {cat?.name}
              </span>
            </div>
            
            {/* 全文テキスト */}
            <div style={{
              fontSize: '14px',
              lineHeight: '1.8',
              color: hoveredMemo.completed ? '#9ca3af' : '#374151',
              textDecoration: hoveredMemo.completed ? 'line-through' : 'none',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              marginBottom: '16px'
            }}>
              {hoveredMemo.text}
            </div>
            
            {/* ボタン */}
            <div style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap'
            }}>
              <button
                onClick={() => {
                  setKanbanEditingMemo(hoveredMemoId)
                }}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                ✏️ 編集
              </button>
              <button
                onClick={() => {
                  setSelectedCategory(hoveredMemo.category)
                  setViewMode('quick')
                  setHoveredMemoId(null)
                }}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                📝 リストへ
              </button>
              <button
                onClick={() => {
                  const updatedMemos = memos.map(m =>
                    m.id === hoveredMemoId ? { ...m, completed: !m.completed, updated_at: new Date().toISOString() } : m
                  )
                  setMemos(updatedMemos)
                  saveMemos(updatedMemos)
                }}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  backgroundColor: hoveredMemo.completed ? '#f59e0b' : '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                {hoveredMemo.completed ? '↩️ 戻す' : '✓ 完了'}
              </button>
              <button
                onClick={() => setHoveredMemoId(null)}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  backgroundColor: '#e5e7eb',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  marginLeft: 'auto'
                }}
              >
                ✕ 閉じる
              </button>
            </div>
          </div>
        )
      })()}

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
                <div
                  key={key}
                  className={`category-item ${dragOverCategoryKey === key ? 'drag-over' : ''}`}
                  data-category-key={key}
                  draggable={true}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move'
                    setDraggedCategoryKey(key)
                  }}
                  onDragOver={(e) => {
                    if (draggedCategoryKey === null || draggedCategoryKey === key) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDragOverCategoryKey(key)
                  }}
                  onDragLeave={() => {
                    setDragOverCategoryKey(null)
                  }}
                  onDrop={(e) => {
                    if (draggedCategoryKey === null || draggedCategoryKey === key) return
                    e.preventDefault()

                    // ドロップ位置を判定（上半分か下半分か）
                    const rect = e.currentTarget.getBoundingClientRect()
                    const mouseY = e.clientY
                    const position = mouseY < rect.top + rect.height / 2 ? 'before' : 'after'

                    console.log(`🖱️ カテゴリードロップ: ${draggedCategoryKey} → ${key} (${position})`)
                    moveCategory(draggedCategoryKey, key, position)
                    setDraggedCategoryKey(null)
                    setDragOverCategoryKey(null)
                  }}
                  onDragEnd={() => {
                    setDraggedCategoryKey(null)
                    setDragOverCategoryKey(null)
                  }}
                >
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
