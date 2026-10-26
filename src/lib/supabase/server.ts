import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "./keys";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    SUPABASE_URL,
    SUPABASE_PUBLIC_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component, where cookies are read-only. The proxy refreshes the session instead.
          }
        },
      },
    },
  );
}
