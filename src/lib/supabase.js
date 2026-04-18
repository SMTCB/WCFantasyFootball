import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://sssmvihxtqtohisghjet.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder_key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
