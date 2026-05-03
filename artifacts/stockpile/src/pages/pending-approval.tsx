import { Clock, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserProfile } from "@/context/UserProfileContext";
import { Mountain } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageToggle } from "@/components/language-toggle";

export default function PendingApproval() {
  const { profile, refetch, logout } = useUserProfile();
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background dark px-4">
      <div className="absolute top-4 right-4 z-50">
        <LanguageToggle />
      </div>

      <div className="w-full max-w-md text-center flex flex-col items-center gap-6">
        <Mountain className="h-10 w-10 text-primary" />

        <div className="rounded border border-border bg-card/80 p-8 shadow-xl w-full">
          <div className="mb-6 flex flex-col items-center gap-3">
            <div className="rounded-full bg-amber-500/10 border border-amber-500/30 p-4">
              <Clock className="h-8 w-8 text-amber-400" />
            </div>
            <h1 className="font-mono text-xl font-bold uppercase tracking-wider text-foreground">
              {t("pendingApproval.title")}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("pendingApproval.desc")}
            </p>
          </div>

          {profile && (
            <div className="rounded border border-border bg-background/50 px-4 py-3 mb-6 text-left text-sm font-mono">
              <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2">
                {t("pendingApproval.accountDetails")}
              </div>
              <div className="flex justify-between text-xs gap-2">
                <span className="text-muted-foreground">{t("pendingApproval.email")}</span>
                <span className="text-foreground truncate">{profile.email ?? "—"}</span>
              </div>
              <div className="flex justify-between text-xs gap-2 mt-1">
                <span className="text-muted-foreground">{t("pendingApproval.status")}</span>
                <span className="text-amber-400 uppercase">{t("pendingApproval.pending")}</span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" onClick={refetch} className="font-mono uppercase text-xs tracking-wider">
              <RefreshCw className="mr-2 h-3 w-3" />
              {t("pendingApproval.checkStatus")}
            </Button>
            <Button variant="ghost" size="sm" onClick={logout} className="font-mono uppercase text-xs tracking-wider text-muted-foreground">
              <LogOut className="mr-2 h-3 w-3" />
              {t("pendingApproval.signOut")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
