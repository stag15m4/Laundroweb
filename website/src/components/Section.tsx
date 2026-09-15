import type { ReactNode } from "react";
import { Container } from "./Container";

export function Section({
  id,
  title,
  lead,
  children,
  tone = "light",
}: {
  id?: string;
  title?: string;
  lead?: string;
  children: ReactNode;
  tone?: "light" | "muted" | "dark";
}) {
  const tones = {
    light: "bg-white text-slate-900",
    muted: "bg-slate-50 text-slate-900",
    dark: "bg-slate-900 text-white",
  } as const;

  return (
    <section id={id} className={`py-16 sm:py-20 ${tones[tone]}`}>
      <Container>
        {title && (
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
        )}
        {lead && (
          <p
            className={`mt-4 max-w-2xl text-lg ${
              tone === "dark" ? "text-slate-300" : "text-slate-600"
            }`}
          >
            {lead}
          </p>
        )}
        <div className={title || lead ? "mt-10" : ""}>{children}</div>
      </Container>
    </section>
  );
}
