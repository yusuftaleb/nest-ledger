// The project's address and public key. The key is Supabase's newer publishable key, or the anon key that
// Vercel's Supabase integration fills in; either works, and it is safe in the browser (row-level security
// decides what it can see).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_PUBLIC_KEY = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
