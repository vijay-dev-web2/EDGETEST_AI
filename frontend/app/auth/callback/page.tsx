"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (!code) {
      router.replace("/");
      return;
    }

    supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
      if (error) {
        console.error("[auth/callback] error:", error.message);
        setError(error.message);
        // Redirect home with error visible in URL for debugging
        setTimeout(() => router.replace(`/?auth_error=${encodeURIComponent(error.message)}`), 3000);
      } else {
        console.log("[auth/callback] session ok:", data.session?.user?.email);
        router.replace("/dashboard");
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0A0F1E] flex-col gap-4">
        <p className="text-red-400 text-sm font-mono px-6 text-center">Sign in failed: {error}</p>
        <p className="text-slate-500 text-xs">Redirecting back…</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[#0A0F1E]">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <p className="text-slate-400 text-sm">Completing sign in…</p>
      </div>
    </div>
  );
}
