import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Mountain, LayoutDashboard, FolderOpen, Plus, Menu, Users, LogOut, ShieldCheck, Settings, ScanSearch } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { useUserProfile } from "@/context/UserProfileContext";
import { getActiveToken } from "@/lib/adminAuth";
import { LanguageToggle } from "@/components/language-toggle";
import { useTranslation } from "react-i18next";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { profile, isLocalAdmin, logout } = useUserProfile();
  const { t } = useTranslation();

  const isAuthenticated = Boolean(getActiveToken());
  const isAdmin = profile?.role === "super_admin" || profile?.role === "admin";
  const isReadOnly = profile?.role === "readonly";

  const baseNavItems = [
    { href: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
    { href: "/jobs", label: t("nav.measurements"), icon: FolderOpen },
    { href: "/jobs/new", label: t("nav.newJob"), icon: Plus },
    { href: "/tools/exif", label: t("nav.exifExtractor"), icon: ScanSearch },
  ];

  const adminNavItem = { href: "/admin/users", label: t("nav.userManagement"), icon: Users };
  const settingsNavItem = { href: "/admin/settings", label: t("nav.settings"), icon: Settings };

  const navItems = [
    ...baseNavItems.filter((item) => {
      if (isReadOnly && item.href === "/jobs/new") return false;
      return true;
    }),
    ...(isAdmin ? [adminNavItem] : []),
    ...(profile?.role === "super_admin" ? [settingsNavItem] : []),
  ];

  const displayName =
    profile?.displayName ?? profile?.username ?? profile?.email ?? "User";

  const NavLinks = () => (
    <>
      {navItems.map((item) => {
        const isActive =
          location === item.href ||
          (item.href !== "/" &&
            location.startsWith(item.href) &&
            item.href !== "/dashboard" &&
            item.href !== "/jobs");
        return (
          <Link key={item.href} href={item.href}>
            <Button
              variant={isActive ? "secondary" : "ghost"}
              className={`w-full justify-start ${
                isActive
                  ? "bg-secondary/50 font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <item.icon className="mr-2 h-4 w-4" />
              {item.label}
            </Button>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background dark text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center justify-between px-4 sm:px-8">
          <div className="flex items-center gap-4">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">{t("nav.toggleMenu")}</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[240px] sm:w-[280px]">
                <div className="flex flex-col gap-6 py-4">
                  <Link
                    href="/"
                    className="flex items-center gap-2 px-2"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Mountain className="h-6 w-6 text-primary" />
                    <span className="font-bold tracking-tight text-lg">PileMetric</span>
                  </Link>
                  <nav className="flex flex-col gap-1">
                    {isAuthenticated && <NavLinks />}
                  </nav>
                </div>
              </SheetContent>
            </Sheet>

            <Link href="/" className="flex items-center gap-2 hidden md:flex">
              <Mountain className="h-6 w-6 text-primary" />
              <span className="font-bold tracking-tight text-lg text-foreground">
                PileMetric
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <LanguageToggle />
            {isAuthenticated ? (
              <div className="flex items-center gap-4">
                {profile && isAdmin && (
                  <span className="hidden sm:flex items-center gap-1 text-xs font-mono uppercase text-primary/80 tracking-wider">
                    <ShieldCheck className="h-3 w-3" />
                    {profile.role === "super_admin" ? t("nav.superAdmin") : t("nav.admin")}
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground hidden sm:inline-block font-mono truncate max-w-[160px]">
                    {displayName}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={logout}
                    className="text-muted-foreground hover:text-foreground"
                    title={t("common.signOut")}
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <a href="/sign-in">
                <Button size="sm">{t("common.signIn")}</Button>
              </a>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        {isAuthenticated && (
          <aside className="hidden md:flex w-64 flex-col gap-2 border-r border-border/40 bg-card/30 p-4">
            <nav className="flex flex-col gap-1 sticky top-20">
              <NavLinks />
            </nav>
          </aside>
        )}
        <main className="flex-1 p-4 sm:p-8 overflow-x-hidden">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
