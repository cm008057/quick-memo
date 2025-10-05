export interface Database {
  public: {
    Tables: {
      memos: {
        Row: {
          id: number
          text: string
          category: string
          timestamp: string
          completed: boolean
          user_id: string
          created_at: string
          deleted: boolean
          updated_at: string
        }
        Insert: {
          id?: number
          text: string
          category: string
          timestamp: string
          completed?: boolean
          user_id: string
          created_at?: string
          deleted?: boolean
          updated_at?: string
        }
        Update: {
          id?: number
          text?: string
          category?: string
          timestamp?: string
          completed?: boolean
          user_id?: string
          created_at?: string
          deleted?: boolean
          updated_at?: string
        }
      }
      categories: {
        Row: {
          id: string
          name: string
          icon: string
          color: string
          order_index: number
          user_id: string
          created_at: string
        }
        Insert: {
          id: string
          name: string
          icon: string
          color: string
          order_index: number
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          icon?: string
          color?: string
          order_index?: number
          user_id?: string
          created_at?: string
        }
      }
      memo_orders: {
        Row: {
          user_id: string
          memo_order: number[]
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          memo_order: number[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          memo_order?: number[]
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}