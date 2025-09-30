-- Create memos table
CREATE TABLE IF NOT EXISTS public.memos (
    id BIGINT PRIMARY KEY,
    text TEXT NOT NULL,
    category TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    completed BOOLEAN DEFAULT false,
    user_id TEXT NOT NULL,
    is_encrypted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create categories table
CREATE TABLE IF NOT EXISTS public.categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    is_encrypted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create memo_orders table (for storing manual sort orders)
CREATE TABLE IF NOT EXISTS public.memo_orders (
    user_id TEXT PRIMARY KEY,
    memo_order BIGINT[] NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Add encryption columns to existing tables (if they don't exist)
ALTER TABLE public.memos ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT false;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT false;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_memos_user_id ON public.memos(user_id);
CREATE INDEX IF NOT EXISTS idx_memos_category ON public.memos(category);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON public.categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_order ON public.categories(order_index);

-- Enable Row Level Security (RLS)
ALTER TABLE public.memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memo_orders ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (if they exist)
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.memos;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.categories;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.memo_orders;

-- Create proper RLS policies for user data separation
-- Memos table policies
CREATE POLICY "Users can view own memos" ON public.memos
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own memos" ON public.memos
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own memos" ON public.memos
    FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own memos" ON public.memos
    FOR DELETE USING (auth.uid()::text = user_id);

-- Categories table policies
CREATE POLICY "Users can view own categories" ON public.categories
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own categories" ON public.categories
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own categories" ON public.categories
    FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own categories" ON public.categories
    FOR DELETE USING (auth.uid()::text = user_id);

-- Memo orders table policies
CREATE POLICY "Users can view own memo orders" ON public.memo_orders
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own memo orders" ON public.memo_orders
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own memo orders" ON public.memo_orders
    FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own memo orders" ON public.memo_orders
    FOR DELETE USING (auth.uid()::text = user_id);