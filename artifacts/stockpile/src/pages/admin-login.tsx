import { useState } from "react";
import { useLocation } from "wouter";
import { Mountain, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setLocalAdminToken } from "@/lib/adminAuth";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      setLocalAdminToken(data.token);
      setLocation("/dashboard");
      window.location.reload();
    } catch {
      setError("Network error — check server connectivity");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background dark px-4 relative">
      <div className="absolute inset-0 z-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CjxwYXRoIGQ9Ik0wIDBoNDB2NDBIMHoiIGZpbGw9Im5vbmUiLz4KPHBhdGggZD0iTTAgNDBoNDBNNDAgMHY0MCIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDIpIiBzdHJva2Utd2lkdGg9IjEiLz4KPC9zdmc+')] pointer-events-none" />
      <div className="relative z-10 w-full max-w-[420px]">
        <div className="rounded border border-border bg-card/80 p-8 shadow-2xl">
          <div className="mb-8 flex flex-col items-center gap-3">
            <Mountain className="h-10 w-10 text-primary" />
            <div className="text-center">
              <h1 className="font-mono text-xl font-bold uppercase tracking-wider text-foreground">
                PileMetric
              </h1>
              <p className="mt-1 text-xs font-mono uppercase tracking-widest text-muted-foreground">
                Administrative Access
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="username" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Username or Email
              </Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username email"
                className="font-mono bg-input border-border"
                disabled={loading}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="font-mono bg-input border-border"
                disabled={loading}
                required
              />
            </div>

            {error && (
              <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive font-mono">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="mt-2 font-mono uppercase tracking-wider"
              disabled={loading}
            >
              <Lock className="mr-2 h-4 w-4" />
              {loading ? "Authenticating…" : "Sign In"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
