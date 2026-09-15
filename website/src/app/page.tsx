import Link from "next/link";
import { Section } from "@/components/Section";
import { Container } from "@/components/Container";
import {
  business,
  highlights,
  equipment,
  payment,
  faqs,
  totalWashers,
  totalDryers,
} from "@/content/site";
import { display, plural, telHref } from "@/content/util";

export default function HomePage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="bg-slate-900 text-white">
        <Container className="py-20 sm:py-28">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-300">
              {display(business.address.city)}, {display(business.address.state)}
            </p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">
              {business.tagline}
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-slate-300">
              {totalWashers} washers and {totalDryers} dryers of {equipment.brand}{" "}
              commercial equipment — including 60 lb machines that swallow a
              comforter whole. In and out in a single trip.
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/visit/"
                className="rounded-lg bg-brand-500 px-6 py-3 text-center text-base font-semibold text-white transition hover:bg-brand-400"
              >
                Hours &amp; directions
              </Link>
              <Link
                href="/pricing/"
                className="rounded-lg border border-slate-600 px-6 py-3 text-center text-base font-semibold text-white transition hover:bg-slate-800"
              >
                See pricing
              </Link>
            </div>
          </div>
        </Container>
      </div>

      {/* ── Why here ─────────────────────────────────────────────────────── */}
      <Section
        title="Why do laundry here"
        lead="A laundromat lives or dies on whether a machine is free when you walk in and whether it actually gets your clothes clean."
      >
        <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {highlights.map((h) => (
            <li key={h.title} className="rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-900">{h.title}</h3>
              <p className="mt-2 leading-relaxed text-slate-600">{h.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── Equipment ────────────────────────────────────────────────────── */}
      <Section
        tone="muted"
        title="The machines"
        lead={`Every washer and dryer in the store is ${equipment.brand} commercial equipment — the same machines hotels and hospitals run all day, every day.`}
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-xl bg-white p-8 shadow-sm">
            <h3 className="text-xl font-bold">
              Washers <span className="text-slate-400">({totalWashers})</span>
            </h3>
            <ul className="mt-6 space-y-5">
              {equipment.washers.map((w) => (
                <li key={w.size} className="border-b border-slate-100 pb-5 last:border-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-lg font-semibold text-brand-700">{w.size}</span>
                    <span className="text-sm font-medium text-slate-500">
                      {w.count} {plural(w.count, "machine")}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600">{w.blurb}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl bg-white p-8 shadow-sm">
            <h3 className="text-xl font-bold">
              Dryers <span className="text-slate-400">({totalDryers})</span>
            </h3>
            <ul className="mt-6 space-y-5">
              {equipment.dryers.map((d) => (
                <li key={d.size} className="border-b border-slate-100 pb-5 last:border-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-lg font-semibold text-brand-700">{d.size}</span>
                    <span className="text-sm font-medium text-slate-500">
                      {d.count} {plural(d.count, "dryer")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm leading-relaxed text-slate-500">
              Stacked dryers are counted individually — each one is a drum you
              can load and run on its own.
            </p>
          </div>
        </div>
      </Section>

      {/* ── Payment ──────────────────────────────────────────────────────── */}
      <Section title="How to pay">
        <div className="grid gap-6 sm:grid-cols-2">
          {[payment.coin, payment.card].map((p) => (
            <div key={p.title} className="rounded-xl border border-slate-200 p-8">
              <h3 className="text-lg font-semibold">{p.title}</h3>
              <p className="mt-2 leading-relaxed text-slate-600">{p.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <Section tone="muted" title="Common questions">
        <dl className="max-w-3xl space-y-6">
          {faqs.map((f) => (
            <div key={f.q} className="rounded-xl bg-white p-6 shadow-sm">
              <dt className="text-lg font-semibold text-slate-900">{f.q}</dt>
              <dd className="mt-2 leading-relaxed text-slate-600">{f.a}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <div className="bg-brand-700 text-white">
        <Container className="py-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Come get it done</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-brand-100">
            Plenty of machines, supplies on site, and an attendant during posted
            hours.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/visit/"
              className="rounded-lg bg-white px-6 py-3 text-base font-semibold text-brand-800 transition hover:bg-brand-50"
            >
              Find us
            </Link>
            <a
              href={telHref(business.phoneHref)}
              className="rounded-lg border border-brand-400 px-6 py-3 text-base font-semibold text-white transition hover:bg-brand-600"
            >
              Call {display(business.phone)}
            </a>
          </div>
        </Container>
      </div>
    </>
  );
}
