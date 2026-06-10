import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vllipntxgdrlintgbguf.supabase.co';
const supabaseAnonKey = 'sb_publishable_qyp6_UnZv58Y3GxHuVGxDg_gCm5zv4h';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
