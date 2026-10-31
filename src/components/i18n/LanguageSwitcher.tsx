"use client";

import { Globe } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { LOCALES } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

// Each language's own name is its own cue -- someone who reads only Spanish
// or only Haitian Creole doesn't need to read English first to recognize
// "Español" or "Kreyòl". The globe icon (not text) signals "pick a
// language" without assuming a reading language either.
export function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 py-1.5 shadow-md"
      role="group"
      aria-label="Language"
    >
      <Globe className="h-4 w-4 text-gray-400 ml-1 flex-shrink-0" aria-hidden="true" />
      {LOCALES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLocale(l.code)}
          aria-pressed={locale === l.code}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
            locale === l.code ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900"
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
