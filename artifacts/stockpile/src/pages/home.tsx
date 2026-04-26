import { SignInButton, SignUpButton } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Mountain, ArrowRight, Layers, Ruler, BarChart3, ShieldCheck } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground selection:bg-primary/30">
      {/* Admin access — fixed top-right, always visible */}
      <a
        href={`${basePath}/admin-login`}
        className="fixed top-4 right-4 z-50 inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors border border-border/50 hover:border-primary/50 rounded px-3 py-1.5 bg-background/90 backdrop-blur shadow-sm"
      >
        <ShieldCheck className="h-3 w-3" />
        Admin Access
      </a>
      <main className="flex-1">
        <section className="relative w-full min-h-[90vh] flex flex-col items-center justify-center overflow-hidden py-24 md:py-32">
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-background/80 dark:bg-background/90 z-10" />
            <img 
              src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/hero-stockpile.png`} 
              alt="Industrial stockpile aerial view" 
              className="w-full h-full object-cover object-center"
            />
            {/* Blueprint grid overlay */}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CjxwYXRoIGQ9Ik0wIDBoNDB2NDBIMHoiIGZpbGw9Im5vbmUiLz4KPHBhdGggZD0iTTAgNDBoNDBNNDAgMHY0MCIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDUpIiBzdHJva2Utd2lkdGg9IjEiLz4KPC9zdmc+')] z-20 pointer-events-none opacity-50 dark:opacity-20" />
          </div>
          
          <div className="container px-4 md:px-6 relative z-30">
            <div className="flex flex-col items-center space-y-8 text-center max-w-4xl mx-auto">
              <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                <Mountain className="mr-2 h-4 w-4" />
                Precision Stockpile Measurement
              </div>
              
              <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl text-foreground font-mono uppercase">
                Measure <span className="text-primary">Earth</span> With Certainty
              </h1>
              
              <p className="mx-auto max-w-[700px] text-lg md:text-xl text-muted-foreground leading-relaxed">
                Upload drone or DSLR imagery. We process it using professional-grade photogrammetry and return precise volume and area calculations. The industrial dashboard for quarry and mining operations.
              </p>
              
              <div className="flex flex-col sm:flex-row w-full max-w-sm gap-4 items-center justify-center mt-4">
                <SignUpButton mode="modal">
                  <Button size="lg" className="w-full sm:w-auto font-mono text-base h-12 px-8">
                    Get Started <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </SignUpButton>
                <SignInButton mode="modal">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto font-mono text-base h-12 px-8">
                    Sign In
                  </Button>
                </SignInButton>
              </div>
            </div>
          </div>
        </section>

        <section className="w-full py-24 bg-card border-y border-border">
          <div className="container px-4 md:px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-6xl mx-auto">
              <div className="flex flex-col items-start space-y-4">
                <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                  <Layers className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold font-mono uppercase">1. Upload Imagery</h3>
                <p className="text-muted-foreground">
                  Drag and drop your drone, smartphone, or DSLR photos. We automatically extract GPS metadata and check image sharpness before processing.
                </p>
              </div>
              <div className="flex flex-col items-start space-y-4">
                <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                  <BarChart3 className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold font-mono uppercase">2. Automated Processing</h3>
                <p className="text-muted-foreground">
                  Your imagery is securely processed using professional-grade photogrammetry and point-cloud generation.
                </p>
              </div>
              <div className="flex flex-col items-start space-y-4">
                <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                  <Ruler className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold font-mono uppercase">3. Precise Results</h3>
                <p className="text-muted-foreground">
                  Get exact volumetric measurements (m³) and surface area mapping on a clean, industrial dashboard built for engineers.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full border-t border-border bg-background py-8">
        <div className="container px-4 md:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Mountain className="h-5 w-5 text-primary" />
            <span className="font-mono font-bold text-sm">PileMetric</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} PileMetric Systems. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}