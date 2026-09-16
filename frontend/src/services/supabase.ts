import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://nhjnrjaljoxoubqudyqk.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oam5yamFsam94b3VicXVkeXFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5MDg0MTIsImV4cCI6MjEwMjQ4NDQxMn0.lvq3fo52OU1lkWPuA8dEZXQlbskDC6Nr2lBzqqS42Z4';


export const supabase = createClient(supabaseUrl, supabaseAnonKey)