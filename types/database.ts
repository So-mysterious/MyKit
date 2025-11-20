export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string
          name: string
          type: string
          currency: string
          created_at: string
          credit_card_details: Json | null
        }
        Insert: {
          id?: string
          name: string
          type: string
          currency: string
          created_at?: string
          credit_card_details?: Json | null
        }
        Update: {
          id?: string
          name?: string
          type?: string
          currency?: string
          created_at?: string
          credit_card_details?: Json | null
        }
      }
      transactions: {
        Row: {
          id: string
          account_id: string
          type: 'income' | 'expense' | 'transfer'
          amount: number
          category: string
          description: string | null
          date: string
          created_at: string
          nominal_amount: number | null
          nominal_currency: string | null
          transfer_group_id: string | null
        }
        Insert: {
          id?: string
          account_id: string
          type: 'income' | 'expense' | 'transfer'
          amount: number
          category: string
          description?: string | null
          date: string
          created_at?: string
          nominal_amount?: number | null
          nominal_currency?: string | null
          transfer_group_id?: string | null
        }
        Update: {
          id?: string
          account_id?: string
          type?: 'income' | 'expense' | 'transfer'
          amount?: number
          category?: string
          description?: string | null
          date?: string
          created_at?: string
          nominal_amount?: number | null
          nominal_currency?: string | null
          transfer_group_id?: string | null
        }
      }
      snapshots: {
        Row: {
          id: string
          account_id: string
          balance: number
          date: string
          created_at: string
          type: string
        }
        Insert: {
          id?: string
          account_id: string
          balance: number
          date: string
          created_at?: string
          type?: string
        }
        Update: {
          id?: string
          account_id?: string
          balance?: number
          date?: string
          created_at?: string
          type?: string
        }
      }
      periodic_tasks: {
        Row: {
          id: string
          account_id: string
          amount: number
          category: string
          description: string | null
          frequency: string
          next_run_date: string
          created_at: string
        }
        Insert: {
          id?: string
          account_id: string
          amount: number
          category: string
          description?: string | null
          frequency?: string
          next_run_date: string
          created_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          amount?: number
          category?: string
          description?: string | null
          frequency?: string
          next_run_date?: string
          created_at?: string
        }
      }
    }
  }
}

