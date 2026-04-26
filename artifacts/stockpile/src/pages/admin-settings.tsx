import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Settings,
  Key,
  Activity,
  Cpu,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  LogIn,
  Trash2,
  Plus,
  BarChart2,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserProfile } from "@/context/UserProfileContext";
import { getLocalAdminToken } from "@/lib/adminAuth";
import { format } from "date-fns";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getLocalAdminToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function apiCall<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    credentials: "include",
    headers: { ...authHeaders(), ...(opts.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Settings {
  webodmToken: { masked: string; source: "database" | "environment" };
  webodmUrl: string;
}

interface ActivityLog {
  id: string;
  level: string;
  event: string;
  userId?: string;
  userEmail?: string;
  jobId?: string;
  message: string;
  meta?: Record<string, unknown>;
  createdAt: string;
}

interface NodeOdmInfo {
  version?: string;
  taskQueueCount?: number;
  totalMemory?: number;
  availableMemory?: number;
  cpuCores?: number;
  maxImages?: number;
  maxParallelTasks?: number;
  engineVersion?: string;
  engine?: string;
  [key: string]: unknown;
}

// ── Level badge ───────────────────────────────────────────────────────────────

function LevelBadge({ level }: { level: string }) {
  const classes: Record<string, string> = {
    error: "bg-destructive/20 text-destructive border-destructive/30",
    warn:  "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    info:  "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono uppercase border ${classes[level] ?? classes.info}`}>
      {level}
    </span>
  );
}

function EventIcon({ event }: { event: string }) {
  if (event.includes("login")) return <LogIn className="h-3 w-3 text-primary" />;
  if (event.includes("deleted")) return <Trash2 className="h-3 w-3 text-destructive" />;
  if (event.includes("created")) return <Plus className="h-3 w-3 text-green-400" />;
  if (event.includes("volume")) return <BarChart2 className="h-3 w-3 text-blue-400" />;
  if (event.includes("token")) return <Key className="h-3 w-3 text-yellow-400" />;
  if (event.includes("user")) return <ShieldAlert className="h-3 w-3 text-orange-400" />;
  return <Activity className="h-3 w-3 text-muted-foreground" />;
}

// ── Token Tab ─────────────────────────────────────────────────────────────────

function TokenTab({ settings, onSaved }: { settings: Settings | null; onSaved: () => void }) {
  const [newToken, setNewToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    if (!newToken.trim()) return;
    setSaving(true); setError(""); setSuccess(false);
    try {
      await apiCall("/admin/settings/webodm-token", {
        method: "PUT",
        body: JSON.stringify({ token: newToken.trim() }),
      });
      setSuccess(true);
      setNewToken("");
      onSaved();
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Current token */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono uppercase text-muted-foreground flex items-center gap-2">
            <Key className="h-4 w-4" />
            Current WebODM Lightning Token
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {settings ? (
            <>
              <div className="flex items-center gap-3 bg-background/60 border border-border/50 rounded px-3 py-2 font-mono text-sm">
                <span className="flex-1 tracking-widest text-muted-foreground">{settings.webodmToken.masked || "(not configured)"}</span>
                <Badge variant="outline" className="text-xs font-mono uppercase">
                  {settings.webodmToken.source === "database" ? "DB override" : "Env var"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Server URL: <span className="font-mono text-foreground/80">{settings.webodmUrl}</span>
              </p>
            </>
          ) : (
            <div className="h-8 bg-muted/30 rounded animate-pulse" />
          )}
        </CardContent>
      </Card>

      {/* Update token */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono uppercase text-muted-foreground">Update Token</CardTitle>
          <CardDescription className="text-xs">
            Paste a new WebODM Lightning API token. It will be stored in the database and take effect immediately without a server restart.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase text-muted-foreground">New Token</Label>
            <div className="relative">
              <Input
                type={showToken ? "text" : "password"}
                placeholder="Paste token here…"
                value={newToken}
                onChange={(e) => setNewToken(e.target.value)}
                className="pr-10 font-mono text-sm bg-background/50"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" /> {error}
            </p>
          )}
          {success && (
            <p className="text-xs text-green-400 flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3" /> Token updated successfully
            </p>
          )}

          <Button onClick={handleSave} disabled={saving || !newToken.trim()} className="font-mono uppercase">
            {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? "Saving…" : "Save Token"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Logs Tab ──────────────────────────────────────────────────────────────────

const EVENT_OPTIONS = [
  "all", "login", "login_failed", "job_created", "job_deleted",
  "volume_calculated", "orthophoto_generated", "user_approved",
  "user_suspended", "user_role_changed", "token_updated", "error",
];

function LogsTab() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState("all");
  const [error, setError] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (eventFilter !== "all") params.set("event", eventFilter);
      const data = await apiCall<ActivityLog[]>(`/admin/logs?${params}`);
      setLogs(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [eventFilter]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="w-[200px] font-mono text-xs uppercase bg-background/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EVENT_OPTIONS.map((e) => (
              <SelectItem key={e} value={e} className="font-mono text-xs uppercase">{e === "all" ? "All Events" : e.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading} className="font-mono uppercase text-xs">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <span className="text-xs text-muted-foreground font-mono">{logs.length} entries</span>
      </div>

      {error && (
        <p className="text-xs text-destructive flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3" /> {error}
        </p>
      )}

      <Card className="bg-card/50 border-border/50 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Activity className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-mono">No logs found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-mono uppercase text-xs w-[140px]">Time</TableHead>
                  <TableHead className="font-mono uppercase text-xs w-[80px]">Level</TableHead>
                  <TableHead className="font-mono uppercase text-xs w-[160px]">Event</TableHead>
                  <TableHead className="font-mono uppercase text-xs">User</TableHead>
                  <TableHead className="font-mono uppercase text-xs">Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id} className="hover:bg-secondary/20 text-sm">
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.createdAt), "MMM d HH:mm:ss")}
                    </TableCell>
                    <TableCell><LevelBadge level={log.level} /></TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 font-mono text-xs">
                        <EventIcon event={log.event} />
                        {log.event.replace(/_/g, " ")}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-[120px] truncate">
                      {log.userEmail ?? log.userId ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">
                      {log.message}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Balance Tab ───────────────────────────────────────────────────────────────

function formatBytes(bytes?: number): string {
  if (bytes == null) return "—";
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 ** 2);
  return `${mb.toFixed(0)} MB`;
}

function BalanceTab() {
  const [data, setData] = useState<{ info: NodeOdmInfo; dashboardUrl: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchBalance = async () => {
    setLoading(true); setError("");
    try {
      const result = await apiCall<{ info: NodeOdmInfo; dashboardUrl: string }>("/admin/webodm-balance");
      setData(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button onClick={fetchBalance} disabled={loading} className="font-mono uppercase">
          {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Cpu className="mr-2 h-4 w-4" />}
          {loading ? "Fetching…" : "Check NodeODM Status"}
        </Button>
        {data?.dashboardUrl && (
          <a href={data.dashboardUrl} target="_blank" rel="noopener noreferrer"
            className="text-xs font-mono text-primary hover:underline flex items-center gap-1">
            <ExternalLink className="h-3 w-3" /> WebODM Dashboard
          </a>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4" /> {error}
        </p>
      )}

      {data?.info && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: "Engine", value: data.info.engine ?? "—" },
            { label: "Engine Version", value: data.info.engineVersion ?? "—" },
            { label: "Server Version", value: data.info.version ?? "—" },
            { label: "CPU Cores", value: data.info.cpuCores?.toString() ?? "—" },
            { label: "Total Memory", value: formatBytes(data.info.totalMemory as number) },
            { label: "Available Memory", value: formatBytes(data.info.availableMemory as number) },
            { label: "Tasks in Queue", value: data.info.taskQueueCount?.toString() ?? "—" },
            { label: "Max Parallel Tasks", value: data.info.maxParallelTasks?.toString() ?? "—" },
            { label: "Max Images/Task", value: data.info.maxImages?.toString() ?? "—" },
          ].map(({ label, value }) => (
            <Card key={label} className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <p className="text-xs font-mono uppercase text-muted-foreground mb-1">{label}</p>
                <p className="text-xl font-bold font-mono">{value}</p>
              </CardContent>
            </Card>
          ))}

          {/* Any extra fields from the server */}
          {Object.entries(data.info)
            .filter(([k]) => !["engine","engineVersion","version","cpuCores","totalMemory","availableMemory","taskQueueCount","maxParallelTasks","maxImages"].includes(k))
            .slice(0, 6)
            .map(([k, v]) => (
              <Card key={k} className="bg-card/50 border-border/50">
                <CardContent className="p-4">
                  <p className="text-xs font-mono uppercase text-muted-foreground mb-1">{k}</p>
                  <p className="text-sm font-mono break-all">{String(v)}</p>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      {!data && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border border-dashed border-border/50 rounded-lg">
          <Cpu className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm font-mono">Click the button above to query NodeODM server status</p>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminSettings() {
  const [, navigate] = useLocation();
  const { profile } = useUserProfile();
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    if (profile && profile.role !== "super_admin") {
      navigate("/dashboard");
    }
  }, [profile, navigate]);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await apiCall<Settings>("/admin/settings");
      setSettings(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void fetchSettings(); }, [fetchSettings]);

  if (profile?.role !== "super_admin") return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-mono uppercase">System Settings</h1>
          <p className="text-muted-foreground text-sm">API token management, activity logs, and NodeODM status</p>
        </div>
      </div>

      <Tabs defaultValue="token" className="space-y-4">
        <TabsList className="bg-card/50 border border-border/50 font-mono uppercase text-xs">
          <TabsTrigger value="token" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            <Key className="h-3.5 w-3.5 mr-1.5" /> API Token
          </TabsTrigger>
          <TabsTrigger value="logs" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            <Activity className="h-3.5 w-3.5 mr-1.5" /> Activity Logs
          </TabsTrigger>
          <TabsTrigger value="balance" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            <Cpu className="h-3.5 w-3.5 mr-1.5" /> NodeODM Status
          </TabsTrigger>
        </TabsList>

        <TabsContent value="token">
          <TokenTab settings={settings} onSaved={fetchSettings} />
        </TabsContent>

        <TabsContent value="logs">
          <LogsTab />
        </TabsContent>

        <TabsContent value="balance">
          <BalanceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
