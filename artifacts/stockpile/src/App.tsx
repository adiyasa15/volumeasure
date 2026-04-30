import { useEffect } from "react";
import { Switch, Route, useLocation, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initAuthTokenGetter, getActiveToken, getLocalAdminToken } from "@/lib/adminAuth";
import { UserProfileProvider, useUserProfile } from "@/context/UserProfileContext";

// Pages
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Jobs from "@/pages/jobs";
import NewJob from "@/pages/new-job";
import JobDetail from "@/pages/job-detail";
import AdminLogin from "@/pages/admin-login";
import PendingApproval from "@/pages/pending-approval";
import AdminUsers from "@/pages/admin-users";
import AdminSettings from "@/pages/admin-settings";
import ExifExtractor from "@/pages/exif-extractor";
import AuthCallback from "@/pages/auth-callback";
import { AppLayout } from "@/components/layout";

// Initialise localStorage → Bearer token getter before any API calls
initAuthTokenGetter();

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Shows PendingApproval page for users not yet approved by admin */
function ApprovalGate({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useUserProfile();

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background dark">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (profile && profile.status !== "approved") {
    return <PendingApproval />;
  }

  return <>{children}</>;
}

function ProtectedRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ApprovalGate>
      <AppLayout>
        <Switch>
          <Route path="/" component={() => {
            useEffect(() => { setLocation('/dashboard'); }, []);
            return null;
          }} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/jobs" component={Jobs} />
          <Route path="/jobs/new" component={NewJob} />
          <Route path="/jobs/:id" component={JobDetail} />
          <Route path="/admin/users" component={AdminUsers} />
          <Route path="/admin/settings" component={AdminSettings} />
          <Route path="/tools/exif" component={ExifExtractor} />
          <Route component={NotFound} />
        </Switch>
      </AppLayout>
    </ApprovalGate>
  );
}

function HomeRedirect() {
  const isAuthenticated = Boolean(getActiveToken()) || Boolean(getLocalAdminToken());

  if (isAuthenticated) {
    return <ProtectedRoutes />;
  }
  return <Home />;
}

function AppRoutes() {
  return (
    <QueryClientProvider client={queryClient}>
      <UserProfileProvider>
        <TooltipProvider>
          <Switch>
            <Route path="/sign-in" component={SignInPage} />
            <Route path="/auth/callback" component={AuthCallback} />
            <Route path="/admin-login" component={AdminLogin} />
            <Route path="/*" component={HomeRedirect} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </UserProfileProvider>
    </QueryClientProvider>
  );
}

function SignInPage() {
  const apiBase = import.meta.env.VITE_API_URL ?? "/api";
  const googleLoginUrl = apiBase.replace(/\/api$/, "") + "/api/auth/google";
  const error = new URLSearchParams(window.location.search).get("error");

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 relative dark">
      <div className="absolute inset-0 z-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CjxwYXRoIGQ9Ik0wIDBoNDB2NDBIMHoiIGZpbGw9Im5vbmUiLz4KPHBhdGggZD0iTTAgNDBoNDBNNDAgMHY0MCIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDIpIiBzdHJva2Utd2lkdGg9IjEiLz4KPC9zdmc+')] pointer-events-none" />
      <a
        href={`${basePath}/admin-login`}
        className="fixed top-4 right-4 z-50 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors border border-border/50 hover:border-primary/50 rounded px-3 py-1.5 bg-background/80 backdrop-blur"
      >
        Admin Access →
      </a>
      <div className="relative z-10 w-full max-w-sm">
        <div className="bg-[#1f2229] rounded border border-[#2c313a] p-8 shadow-2xl flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-2">
            <img
              src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/logo.svg`}
              alt="PileMetric"
              className="h-12 w-12"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <h1 className="text-xl font-bold font-mono uppercase tracking-wide text-foreground">
              PileMetric
            </h1>
            <p className="text-sm text-muted-foreground text-center">
              Sign in to access your stockpile measurements
            </p>
          </div>

          {error && (
            <div className="w-full rounded bg-destructive/20 border border-destructive/30 px-4 py-2 text-xs font-mono text-destructive text-center">
              {error === "google_denied" && "Google sign-in was cancelled."}
              {error === "oauth_failed" && "Sign-in failed. Please try again."}
              {error !== "google_denied" && error !== "oauth_failed" && "Sign-in failed. Please try again."}
            </div>
          )}

          <a
            href={googleLoginUrl}
            className="w-full flex items-center justify-center gap-3 rounded border border-border bg-background hover:bg-secondary/50 transition-colors px-4 py-3 text-sm font-medium text-foreground"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 flex-shrink-0">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </a>

          <p className="text-xs text-muted-foreground text-center">
            New accounts require admin approval before access is granted.
          </p>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <AppRoutes />
    </WouterRouter>
  );
}

export default App;
