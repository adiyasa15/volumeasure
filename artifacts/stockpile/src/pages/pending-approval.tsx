import { Clock, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserProfile } from "@/context/UserProfileContext";
import { Mountain } from "lucide-react";

export default function PendingApproval() {
  const { profile, refetch, logout } = useUserProfile();

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background dark px-4">
      <div className="w-full max-w-md text-center flex flex-col items-center gap-6">
        <Mountain className="h-10 w-10 text-primary" />

        <div className="rounded border border-border bg-card/80 p-8 shadow-xl w-full">
          <div className="mb-6 flex flex-col items-center gap-3">
            <div className="rounded-full bg-amber-500/10 border border-amber-500/30 p-4">
              <Clock className="h-8 w-8 text-amber-400" />
            </div>
            <h1 className="font-mono text-xl font-bold uppercase tracking-wider text-foreground">
              Awaiting Approval
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your account has been created and is pending admin approval. You'll
              gain access once an administrator reviews your registration.
            </p>
          </div>

          {profile && (
            <div className="rounded border border-border bg-background/50 px-4 py-3 mb-6 text-left text-sm font-mono">
              <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Account Details</div>
              <div className="flex justify-between text-xs gap-2">
                <span className="text-muted-foreground">Email</span>
                <span className="text-foreground truncate">{profile.email ?? "—"}</span>
              </div>
              <div className="flex justify-between text-xs gap-2 mt-1">
                <span className="text-muted-foreground">Status</span>
                <span className="text-amber-400 uppercase">Pending</span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" onClick={refetch} className="font-mono uppercase text-xs tracking-wider">
              <RefreshCw className="mr-2 h-3 w-3" />
              Check Status
            </Button>
            <Button variant="ghost" size="sm" onClick={logout} className="font-mono uppercase text-xs tracking-wider text-muted-foreground">
              <LogOut className="mr-2 h-3 w-3" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
