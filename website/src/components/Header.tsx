"use client";

import Link from "next/link";
import { useState } from "react";
import { business } from "@/content/site";
import { display, telHref } from "@/content/util";
import { Container } from "./Container";

const nav = [
  { href: "/", label: "Home" },
  { href: "/pricing/", label: "Pricing" },
  { href: "/commercial/", label: "Business Accounts" },
  { href: "/visit/", label: "Hours & Location" },
];

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <Container>
        <div className="flex h-16 items-center justify-between">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-slate-900"
            onClick={() => setOpen(false)}
          >
            {business.name}
          </Link>

          <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-slate-600 transition hover:text-brand-700"
              >
                {item.label}
              </Link>
            ))}
            <a
              href={telHref(business.phoneHref)}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Call {display(business.phone)}
            </a>
          </nav>

          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg p-2 text-slate-700 md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>

        {open && (
          <nav id="mobile-nav" className="border-t border-slate-200 py-4 md:hidden" aria-label="Mobile">
            <ul className="space-y-1">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block rounded-lg px-3 py-2 text-base font-medium text-slate-700 hover:bg-slate-50"
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li className="pt-2">
                <a
                  href={telHref(business.phoneHref)}
                  className="block rounded-lg bg-brand-600 px-3 py-2 text-center text-base font-semibold text-white"
                >
                  Call {display(business.phone)}
                </a>
              </li>
            </ul>
          </nav>
        )}
      </Container>
    </header>
  );
}
