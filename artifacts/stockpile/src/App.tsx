import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { dark } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initAuthTokenGetter, getLocalAdminToken } from "@/lib/adminAuth";
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
import { AppLayout } from "@/components/layout";

// Initialise localStorage → Bearer token getter before any API calls
initAuthTokenGetter();

const queryClient = new QueryClient();

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: dark,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(25 90% 55%)",
    colorForeground: "hsl(40 10% 90%)",
    colorMutedForeground: "hsl(220 10% 60%)",
    colorDanger: "hsl(0 70% 50%)",
    colorBackground: "hsl(220 15% 14%)",
    colorInput: "hsl(220 15% 25%)",
    colorInputForeground: "hsl(40 10% 90%)",
    colorNeutral: "hsl(220 15% 22%)",
    colorModalBackdrop: "rgba(0,0,0, 0.7)",
    fontFamily: "var(--app-font-sans)",
    borderRadius: "0.25rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "bg-[#1f2229] rounded border border-[#2c313a] w-[440px] max-w-full overflow-hidden shadow-2xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-foreground font-mono uppercase font-bold",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: { color: "rgba(255,255,255,0.92)", fontWeight: "500" },
    formFieldLabel: "text-muted-foreground font-mono uppercase text-xs",
    footerActionLink: "text-primary hover:text-primary/80",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground text-xs uppercase font-mono",
    identityPreviewEditButton: "text-primary hover:text-primary/80",
    formFieldSuccessText: "text-green-500",
    alertText: "text-destructive font-mono",
    logoBox: "mb-6 flex justify-center",
    logoImage: "h-12",
    socialButtonsBlockButton: "border border-border bg-background hover:bg-secondary/50 rounded",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90 rounded font-mono uppercase",
    formFieldInput: "bg-input border-border text-foreground rounded font-mono placeholder:text-muted-foreground/50",
    footerAction: "bg-background",
    dividerLine: "bg-border",
    alert: "bg-destructive/20 border border-destructive/30 text-destructive rounded",
    otpCodeFieldInput: "bg-input border-border text-foreground rounded font-mono",
    formFieldRow: "mb-4",
    main: "flex flex-col gap-4",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 relative">
      <div className="absolute inset-0 z-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CjxwYXRoIGQ9Ik0wIDBoNDB2NDBIMHoiIGZpbGw9Im5vbmUiLz4KPHBhdGggZD0iTTAgNDBoNDBNNDAgMHY0MCIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDIpIiBzdHJva2Utd2lkdGg9IjEiLz4KPC9zdmc+')] pointer-events-none" />
      {/* Admin link — fixed to top-right, always visible */}
      <a
        href={`${basePath}/admin-login`}
        className="fixed top-4 right-4 z-50 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors border border-border/50 hover:border-primary/50 rounded px-3 py-1.5 bg-background/80 backdrop-blur"
      >
        Admin Access →
      </a>
      <div className="relative z-10">
        <SignIn
          routing="path"
          path={`${basePath}/sign-in`}
          signUpUrl={`${basePath}/sign-up`}
          fallbackRedirectUrl={`${basePath}/dashboard`}
        />
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 relative">
      <div className="absolute inset-0 z-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CjxwYXRoIGQ9Ik0wIDBoNDB2NDBIMHoiIGZpbGw9Im5vbmUiLz4KPHBhdGggZD0iTTAgNDBoNDBNNDAgMHY0MCIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDIpIiBzdHJva2Utd2lkdGg9IjEiLz4KPC9zdmc+')] pointer-events-none" />
      <div className="relative z-10">
        <SignUp
          routing="path"
          path={`${basePath}/sign-up`}
          signInUrl={`${basePath}/sign-in`}
          fallbackRedirectUrl={`${basePath}/dashboard`}
        />
      </div>
    </div>
  );
}

/** Gate: shows PendingApproval for pending/suspended Clerk users */
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

function HomeRedirect() {
  const [, setLocation] = useLocation();
  const isLocalAdmin = Boolean(getLocalAdminToken());

  return (
    <>
      <Show when="signed-in">
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
      </Show>
      <Show when="signed-out">
        {isLocalAdmin ? (
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
        ) : (
          <Home />
        )}
      </Show>
    </>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      localization={{
        signIn: {
          start: {
            title: "Engineer Access",
            subtitle: "Sign in to PileMetric",
          },
        },
        signUp: {
          start: {
            title: "Create Account",
            subtitle: "Join PileMetric",
          },
        },
        formFieldLabel__emailAddress: "Username / Email Address",
        formFieldInputPlaceholder__emailAddress: "Enter username or email address",
        formFieldLabel__emailAddress_username: "Username / Email Address",
        formFieldInputPlaceholder__emailAddress_username: "Enter username or email address",
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <UserProfileProvider>
          <ClerkQueryClientCacheInvalidator />
          <TooltipProvider>
            <Switch>
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
              <Route path="/admin-login" component={AdminLogin} />
              <Route path="/*" component={HomeRedirect} />
            </Switch>
            <Toaster />
          </TooltipProvider>
        </UserProfileProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
