import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Magic-link landing. Handles both the default link (?code=) and the token-hash template (?token_hash=&type=).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const supabase = await createClient();

  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: (params.get("type") ?? "email") as EmailOtpType })
      : { error: new Error("missing token") };

  return NextResponse.redirect(new URL(error ? "/login?error=link" : "/", request.url));
}
