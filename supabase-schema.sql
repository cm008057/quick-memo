-- Create memos table
CREATE TABLE IF NOT EXISTS public.memos (
    id BIGINT PRIMARY KEY,
    text TEXT NOT NULL,
    category TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    completed BOOLEAN DEFAULT false,
    user_id TEXT NOT NULL,
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create memo_orders table (for storing manual sort orders)
CREATE TABLE IF NOT EXISTS public.memo_orders (
    user_id TEXT PRIMARY KEY,
    memo_order BIGINT[] NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_memos_user_id ON public.memos(user_id);
CREATE INDEX IF NOT EXISTS idx_memos_category ON public.memos(category);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON public.categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_order ON public.categories(order_index);

-- Enable Row Level Security (RLS)
ALTER TABLE public.memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memo_orders ENABLE ROW LEVEL SECURITY;

-- Create policies (for future user authentication)
-- For now, we'll allow all operations for demo purposes
CREATE POLICY "Allow all operations for authenticated users" ON public.memos
    FOR ALL USING (true);

CREATE POLICY "Allow all operations for authenticated users" ON public.categories
    FOR ALL USING (true);

CREATE POLICY "Allow all operations for authenticated users" ON public.memo_orders
    FOR ALL USING (true);