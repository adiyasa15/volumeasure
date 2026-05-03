import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Languages } from "lucide-react";

const LANGUAGES = [
  { code: "en", label: "English", short: "EN" },
  { code: "id", label: "Bahasa Indonesia", short: "ID" },
];

export function LanguageToggle() {
  const { i18n } = useTranslation();
  const current = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 font-mono text-xs uppercase text-muted-foreground hover:text-foreground px-2"
          title="Change language"
        >
          <Languages className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{current.short}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="font-mono text-xs w-40">
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => i18n.changeLanguage(lang.code)}
            className={`gap-2 cursor-pointer uppercase ${
              i18n.language === lang.code ? "text-primary font-bold" : ""
            }`}
          >
            <span className="w-6 text-center opacity-60">{lang.short}</span>
            {lang.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
