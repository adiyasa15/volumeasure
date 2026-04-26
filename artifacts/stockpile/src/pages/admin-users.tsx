import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Clock,
  Ban,
  ShieldCheck,
  Shield,
  UserIcon,
  Eye,
  X,
  Save,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useUserProfile } from "@/context/UserProfileContext";
import { getLocalAdminToken } from "@/lib/adminAuth";
import type { UserRole, UserStatus, UserProfile } from "@/lib/adminAuth";

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
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  user: "User",
  readonly: "Read-only",
};

const STATUS_LABELS: Record<UserStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  suspended: "Suspended",
};

function RoleBadge({ role }: { role: UserRole }) {
  const variants: Record<UserRole, string> = {
    super_admin: "bg-red-500/20 text-red-300 border-red-500/30",
    admin: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    user: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    readonly: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
  };
  const icons: Record<UserRole, React.ReactNode> = {
    super_admin: <ShieldCheck className="h-3 w-3" />,
    admin: <Shield className="h-3 w-3" />,
    user: <UserIcon className="h-3 w-3" />,
    readonly: <Eye className="h-3 w-3" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-mono uppercase ${variants[role]}`}>
      {icons[role]}
      {ROLE_LABELS[role]}
    </span>
  );
}

function StatusBadge({ status }: { status: UserStatus }) {
  const variants: Record<UserStatus, string> = {
    approved: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    pending: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    suspended: "bg-red-500/20 text-red-300 border-red-500/30",
  };
  const icons: Record<UserStatus, React.ReactNode> = {
    approved: <CheckCircle2 className="h-3 w-3" />,
    pending: <Clock className="h-3 w-3" />,
    suspended: <Ban className="h-3 w-3" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-mono uppercase ${variants[status]}`}>
      {icons[status]}
      {STATUS_LABELS[status]}
    </span>
  );
}

interface EditState {
  userId: string;
  displayName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

interface CreateState {
  email: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  password: string;
}

export default function AdminUsers() {
  const { profile: myProfile, loading: myLoading } = useUserProfile();
  const [, setLocation] = useLocation();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<EditState | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createState, setCreateState] = useState<CreateState>({
    email: "",
    displayName: "",
    role: "user",
    status: "approved",
    password: "",
  });
  const [createSaving, setCreateSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiCall<UserProfile[]>("/admin/users");
      setUsers(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!myLoading && myProfile) {
      if (myProfile.role !== "super_admin" && myProfile.role !== "admin") {
        setLocation("/dashboard");
        return;
      }
      fetchUsers();
    }
  }, [myLoading, myProfile, fetchUsers, setLocation]);

  const canAssignRole = (role: UserRole): boolean => {
    if (!myProfile) return false;
    if (myProfile.role === "super_admin") return true;
    return role === "user" || role === "readonly";
  };

  const handleEditSave = async () => {
    if (!editUser) return;
    setEditSaving(true);
    try {
      const updated = await apiCall<UserProfile>(`/admin/users/${editUser.userId}`, {
        method: "PATCH",
        body: JSON.stringify({
          displayName: editUser.displayName,
          email: editUser.email,
          role: editUser.role,
          status: editUser.status,
        }),
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setEditUser(null);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setEditSaving(false);
    }
  };

  const handleCreate = async () => {
    setCreateSaving(true);
    try {
      const created = await apiCall<UserProfile>("/admin/users", {
        method: "POST",
        body: JSON.stringify(createState),
      });
      setUsers((prev) => [created, ...prev]);
      setCreateOpen(false);
      setCreateState({ email: "", displayName: "", role: "user", status: "approved", password: "" });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCreateSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const user = users.find((u) => u.id === deleteId);
    if (!user) return;
    const nameToConfirm = user.displayName || user.email || user.id;
    if (deleteConfirm !== nameToConfirm) return;
    try {
      await apiCall(`/admin/users/${deleteId}`, { method: "DELETE" });
      setUsers((prev) => prev.filter((u) => u.id !== deleteId));
      setDeleteId(null);
      setDeleteConfirm("");
    } catch (e: any) {
      alert(e.message);
    }
  };

  const roleOptions: UserRole[] = myProfile?.role === "super_admin"
    ? ["super_admin", "admin", "user", "readonly"]
    : ["user", "readonly"];

  if (myLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-destructive/40 bg-destructive/10 p-4 text-destructive font-mono text-sm">
        {error}
      </div>
    );
  }

  const deleteUser = deleteId ? users.find((u) => u.id === deleteId) : null;
  const nameToConfirm = deleteUser ? (deleteUser.displayName || deleteUser.email || deleteUser.id) : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight font-mono uppercase">
            User Management
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchUsers}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add User
          </Button>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded border border-border bg-card/30 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background/50">
              <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">User</th>
              <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">Role</th>
              <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">Joined</th>
              <th className="px-4 py-3 text-right font-mono text-xs uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground text-sm">
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const isSelf = user.id === myProfile?.id;
                return (
                  <tr key={user.id} className="border-b border-border/50 hover:bg-card/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {user.displayName ?? user.username ?? "—"}
                          {isSelf && <span className="ml-2 text-xs text-primary">(you)</span>}
                        </span>
                        <span className="text-xs text-muted-foreground">{user.email ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={user.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!isSelf && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() =>
                              setEditUser({
                                userId: user.id,
                                displayName: user.displayName ?? "",
                                email: user.email ?? "",
                                role: user.role,
                                status: user.status,
                              })
                            }
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => { setDeleteId(user.id); setDeleteConfirm(""); }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="dark bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-wider text-sm">Edit User</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Display Name</Label>
                <Input value={editUser.displayName} onChange={(e) => setEditUser({ ...editUser, displayName: e.target.value })} className="font-mono bg-input border-border" />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Email</Label>
                <Input value={editUser.email} onChange={(e) => setEditUser({ ...editUser, email: e.target.value })} className="font-mono bg-input border-border" type="email" />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Role</Label>
                <Select value={editUser.role} onValueChange={(v) => setEditUser({ ...editUser, role: v as UserRole })}>
                  <SelectTrigger className="font-mono bg-input border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((r) => (
                      <SelectItem key={r} value={r} className="font-mono">{ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
                <Select value={editUser.status} onValueChange={(v) => setEditUser({ ...editUser, status: v as UserStatus })}>
                  <SelectTrigger className="font-mono bg-input border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved" className="font-mono">Approved</SelectItem>
                    <SelectItem value="pending" className="font-mono">Pending</SelectItem>
                    <SelectItem value="suspended" className="font-mono">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              <Save className="h-4 w-4 mr-2" />
              {editSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="dark bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-wider text-sm">Create User</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Email *</Label>
              <Input value={createState.email} onChange={(e) => setCreateState({ ...createState, email: e.target.value })} className="font-mono bg-input border-border" type="email" required />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Display Name</Label>
              <Input value={createState.displayName} onChange={(e) => setCreateState({ ...createState, displayName: e.target.value })} className="font-mono bg-input border-border" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Password (optional — for local login)</Label>
              <Input value={createState.password} onChange={(e) => setCreateState({ ...createState, password: e.target.value })} className="font-mono bg-input border-border" type="password" />
            </div>
            <div className="flex gap-4">
              <div className="flex flex-col gap-1 flex-1">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Role</Label>
                <Select value={createState.role} onValueChange={(v) => setCreateState({ ...createState, role: v as UserRole })}>
                  <SelectTrigger className="font-mono bg-input border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((r) => (
                      <SelectItem key={r} value={r} className="font-mono">{ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
                <Select value={createState.status} onValueChange={(v) => setCreateState({ ...createState, status: v as UserStatus })}>
                  <SelectTrigger className="font-mono bg-input border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved" className="font-mono">Approved</SelectItem>
                    <SelectItem value="pending" className="font-mono">Pending</SelectItem>
                    <SelectItem value="suspended" className="font-mono">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createSaving || !createState.email}>
              <Plus className="h-4 w-4 mr-2" />
              {createSaving ? "Creating…" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteId} onOpenChange={(o) => { if (!o) { setDeleteId(null); setDeleteConfirm(""); } }}>
        <DialogContent className="dark bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-wider text-sm text-destructive">Delete User</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <p className="text-sm text-muted-foreground">
              This action cannot be undone. Type <strong className="text-foreground font-mono">{nameToConfirm}</strong> to confirm.
            </p>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={nameToConfirm}
              className="font-mono bg-input border-border"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteId(null); setDeleteConfirm(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteConfirm !== nameToConfirm}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
