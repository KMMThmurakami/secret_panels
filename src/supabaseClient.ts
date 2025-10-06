
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hharoarwwkilgaotdbkz.supabase.co'
const supabaseKey = process.env.SUPABASE_KEY || "null";
export const supabase = createClient(supabaseUrl, supabaseKey)
