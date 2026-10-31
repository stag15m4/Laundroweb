"use client";

import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { LOCALES } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();

  return (
    <div className="inline-flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1" role="group" aria-label="Language">
      {LOCALES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLocale(l.code)}
          aria-pressed={locale === l.code}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            locale === l.code ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
