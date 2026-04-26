import { Link, useLocation } from "wouter";
import { useAuth, useUser, UserButton, SignInButton } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Mountain, LayoutDashboard, FolderOpen, Plus, Menu, Users, LogOut, ShieldCheck, Settings } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { useUserProfile } from "@/context/UserProfileContext";
import { getLocalAdminToken } from "@/lib/adminAuth";

const baseNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Measurements", icon: FolderOpen },
  { href: "/jobs/new", label: "New Job", icon: Plus },
];

const adminNavItem = { href: "/admin/users", label: "User Management", icon: Users };
const settingsNavItem = { href: "/admin/settings", label: "Settings", icon: Settings };

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { profile, isLocalAdmin, logout } = useUserProfile();

  const isAuthenticated = isSignedIn || isLocalAdmin;
  const isAdmin = profile?.role === "super_admin" || profile?.role === "admin";
  const isReadOnly = profile?.role === "readonly";

  const navItems = [
    ...baseNavItems.filter((item) => {
      // readonly cannot create new jobs
      if (isReadOnly && item.href === "/jobs/new") return false;
      return true;
    }),
    ...(isAdmin ? [adminNavItem] : []),
    ...(profile?.role === "super_admin" ? [settingsNavItem] : []),
  ];

  const displayName = isLocalAdmin
    ? (profile?.displayName ?? profile?.username ?? "Admin")
    : (user?.primaryEmailAddress?.emailAddress ?? "");

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
                  <span className="sr-only">Toggle menu</span>
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

          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <div className="flex items-center gap-4">
                {profile && isAdmin && (
                  <span className="hidden sm:flex items-center gap-1 text-xs font-mono uppercase text-primary/80 tracking-wider">
                    <ShieldCheck className="h-3 w-3" />
                    {profile.role === "super_admin" ? "Super Admin" : "Admin"}
                  </span>
                )}
                {!isLocalAdmin && (
                  <span className="text-sm font-medium text-muted-foreground hidden sm:inline-block">
                    {displayName}
                  </span>
                )}
                {isLocalAdmin ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground hidden sm:inline-block font-mono">
                      {displayName}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={logout}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <UserButton
                    appearance={{
                      variables: {
                        colorBackground: "#1a1a1a",
                        colorText: "#ffffff",
                        colorTextSecondary: "rgba(255,255,255,0.7)",
                        colorNeutral: "#ffffff",
                      },
                      elements: {
                        avatarBox: "h-8 w-8 rounded-md",
                        userButtonPopoverCard: {
                          backgroundColor: "#1a1a1a",
                          border: "1px solid rgba(255,255,255,0.1)",
                          boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
                        },
                        userButtonPopoverActionButton: { color: "#ffffff" },
                        userButtonPopoverActionButtonText: { color: "#ffffff" },
                        userButtonPopoverActionButtonIcon: {
                          color: "rgba(255,255,255,0.7)",
                        },
                        userButtonPopoverFooter: {
                          borderTop: "1px solid rgba(255,255,255,0.1)",
                        },
                      },
                    }}
                  />
                )}
              </div>
            ) : (
              <SignInButton mode="modal">
                <Button size="sm">Sign In</Button>
              </SignInButton>
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
