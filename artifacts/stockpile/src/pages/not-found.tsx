import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background dark">
      <div className="flex flex-col items-center gap-4 text-center p-8">
        <AlertCircle className="h-12 w-12 text-destructive opacity-60" />
        <h1 className="text-2xl font-bold font-mono uppercase tracking-tight">{t("notFound.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("notFound.desc")}</p>
        <Link href="/dashboard">
          <Button variant="outline" className="font-mono uppercase text-xs mt-2">
            {t("notFound.backHome")}
          </Button>
        </Link>
      </div>
    </div>
  );
}
