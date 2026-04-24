import { Link, useLocation } from "wouter";
import { useAuth, useUser, UserButton, SignInButton } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Mountain, LayoutDashboard, FolderOpen, Plus, Activity, Settings, LogOut, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Measurements", icon: FolderOpen },
  { href: "/jobs/new", label: "New Job", icon: Plus },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const NavLinks = () => (
    <>
      {navItems.map((item) => {
        const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href) && item.href !== "/dashboard" && item.href !== "/jobs");
        return (
          <Link key={item.href} href={item.href}>
            <Button
              variant={isActive ? "secondary" : "ghost"}
              className={`w-full justify-start ${isActive ? "bg-secondary/50 font-medium" : "text-muted-foreground hover:text-foreground"}`}
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
                  <Link href="/" className="flex items-center gap-2 px-2" onClick={() => setMobileMenuOpen(false)}>
                    <Mountain className="h-6 w-6 text-primary" />
                    <span className="font-bold tracking-tight text-lg">PileMetric</span>
                  </Link>
                  <nav className="flex flex-col gap-1">
                    {isSignedIn && <NavLinks />}
                  </nav>
                </div>
              </SheetContent>
            </Sheet>
            
            <Link href="/" className="flex items-center gap-2 hidden md:flex">
              <Mountain className="h-6 w-6 text-primary" />
              <span className="font-bold tracking-tight text-lg text-foreground">PileMetric</span>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            {isSignedIn ? (
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-muted-foreground hidden sm:inline-block">
                  {user?.primaryEmailAddress?.emailAddress}
                </span>
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: "h-8 w-8 rounded-md",
                      userButtonPopoverCard: "bg-[#1a1a1a] border border-white/10 shadow-xl",
                      userButtonPopoverActionButton:
                        "text-white/90 hover:bg-white/10 hover:text-white",
                      userButtonPopoverActionButtonText: "text-white/90",
                      userButtonPopoverActionButtonIcon: "text-white/70",
                      userButtonPopoverFooter: "border-t border-white/10",
                    },
                  }}
                />
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
        {isSignedIn && (
          <aside className="hidden md:flex w-64 flex-col gap-2 border-r border-border/40 bg-card/30 p-4">
            <nav className="flex flex-col gap-1 sticky top-20">
              <NavLinks />
            </nav>
          </aside>
        )}
        <main className="flex-1 p-4 sm:p-8 overflow-x-hidden">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}