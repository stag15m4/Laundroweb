import type { Metadata } from "next";
import { Section } from "@/components/Section";
import { Container } from "@/components/Container";
import { business, commercialSegments, equipment, formEndpoint } from "@/content/site";
import { display, isPlaceholder, telHref, mailtoHref } from "@/content/util";

export const metadata: Metadata = {
  title: "Business Accounts",
  description:
    "Commercial laundry accounts for salons, gyms, restaurants, and short-term rentals. Volume pricing and dependable turnaround.",
};

export default function CommercialPage() {
  return (
    <>
      <div className="bg-slate-900 text-white">
        <Container className="py-16">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Business accounts
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-300">
            If laundry is a standing cost of running your business, it should be
            predictable. We work with local businesses on recurring volume at
            rates that beat paying per machine.
          </p>
        </Container>
      </div>

      <Section title="Who we work with">
        <ul className="grid gap-8 sm:grid-cols-2">
          {commercialSegments.map((s) => (
            <li key={s.title} className="rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 leading-relaxed text-slate-600">{s.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        tone="muted"
        title="Why a laundromat instead of in-house machines"
        lead="Commercial volume kills consumer machines, and replacing them is rarely cheaper than outsourcing."
      >
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            {
              h: "Capacity you cannot buy cheaply",
              p: `Our 60 lb washers and 45 lb dryers move volume that would take a home machine an entire day.`,
            },
            {
              h: "No maintenance on your books",
              p: "Repairs, parts, water, and gas are our problem. You pay for clean laundry, not uptime.",
            },
            {
              h: `${equipment.brand} commercial equipment`,
              p: "Built for continuous duty, with the extract speed that gets heavy linens actually dry.",
            },
          ].map((item) => (
            <div key={item.h} className="rounded-xl bg-white p-6 shadow-sm">
              <h3 className="text-base font-semibold">{item.h}</h3>
              <p className="mt-2 leading-relaxed text-slate-600">{item.p}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Get a quote" lead="Tell us roughly what you need and we will come back with pricing and a turnaround time.">
        {formEndpoint ? (
          <form
            action={formEndpoint}
            method="POST"
            className="max-w-xl space-y-5"
          >
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-700">
                Your name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                autoComplete="name"
                className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2.5 shadow-sm"
              />
            </div>
            <div>
              <label htmlFor="businessName" className="block text-sm font-medium text-slate-700">
                Business name
              </label>
              <input
                id="businessName"
                name="businessName"
                type="text"
                required
                autoComplete="organization"
                className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2.5 shadow-sm"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2.5 shadow-sm"
              />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-slate-700">
                Phone <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2.5 shadow-sm"
              />
            </div>
            <div>
              <label htmlFor="details" className="block text-sm font-medium text-slate-700">
                What do you need washed, and how often?
              </label>
              <textarea
                id="details"
                name="details"
                rows={4}
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2.5 shadow-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white transition hover:bg-brand-700"
            >
              Request a quote
            </button>
          </form>
        ) : (
          <div className="max-w-xl rounded-xl border border-slate-200 bg-slate-50 p-8">
            <p className="leading-relaxed text-slate-700">
              Call or email and we will put together pricing for your volume.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <a
                href={telHref(business.phoneHref)}
                className="rounded-lg bg-brand-600 px-6 py-3 text-center font-semibold text-white transition hover:bg-brand-700"
              >
                Call {display(business.phone)}
              </a>
              {!isPlaceholder(business.email) && (
                <a
                  href={mailtoHref(business.email, "Business account enquiry")}
                  className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-center font-semibold text-slate-800 transition hover:bg-slate-100"
                >
                  Email us
                </a>
              )}
            </div>
          </div>
        )}
      </Section>
    </>
  );
}
