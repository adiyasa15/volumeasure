import { useEffect } from "react";
import { setGoogleToken } from "@/lib/adminAuth";

const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export default function AuthCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const error = params.get("error");

    if (token) {
      setGoogleToken(token);
      window.location.href = `${window.location.origin}${basePath}/dashboard`;
    } else {
      const errParam = error ? `?error=${encodeURIComponent(error)}` : "?error=oauth_failed";
      window.location.href = `${window.location.origin}${basePath}/sign-in${errParam}`;
    }
  }, []);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background dark">
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground font-mono">Signing in…</p>
      </div>
    </div>
  );
}
