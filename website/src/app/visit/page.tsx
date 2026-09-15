import type { Metadata } from "next";
import { Section } from "@/components/Section";
import { Container } from "@/components/Container";
import { business, hours, lastWashNotice } from "@/content/site";
import { display, isPlaceholder, telHref, mailtoHref } from "@/content/util";

export const metadata: Metadata = {
  title: "Hours & Location",
  description:
    "Opening hours, attended hours, address, and directions to the laundromat.",
};

export default function VisitPage() {
  const { address } = business;
  const hasAttendant = hours.some((h) => h.attended);

  return (
    <>
      <div className="bg-slate-900 text-white">
        <Container className="py-16">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Hours &amp; location
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-300">
            Open seven days a week, with an attendant on site during the hours
            listed below.
          </p>
        </Container>
      </div>

      <Section>
        <div className="grid gap-12 lg:grid-cols-2">
          {/* Hours table */}
          <div>
            <h2 className="text-2xl font-bold">Hours</h2>
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-left">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th scope="col" className="px-5 py-3 text-sm font-semibold text-slate-700">
                      Day
                    </th>
                    <th scope="col" className="px-5 py-3 text-sm font-semibold text-slate-700">
                      Open
                    </th>
                    {hasAttendant && (
                      <th scope="col" className="px-5 py-3 text-sm font-semibold text-slate-700">
                        Attended
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {hours.map((h) => (
                    <tr key={h.day}>
                      <th scope="row" className="px-5 py-3 font-medium text-slate-900">
                        {h.day}
                      </th>
                      <td className="px-5 py-3 text-slate-700">{display(h.open)}</td>
                      {hasAttendant && (
                        <td className="px-5 py-3 text-slate-500">
                          {h.attended ? (
                            display(h.attended)
                          ) : (
                            <span className="text-slate-400">Self-serve</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {lastWashNotice && (
              <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {display(lastWashNotice)}
              </p>
            )}

            {hasAttendant && (
              <p className="mt-4 text-sm leading-relaxed text-slate-500">
                Outside attended hours the store stays open and fully self-serve —
                every machine works exactly the same, there is simply no one
                behind the counter.
              </p>
            )}
          </div>

          {/* Location */}
          <div>
            <h2 className="text-2xl font-bold">Find us</h2>
            <address className="mt-6 not-italic text-lg leading-relaxed text-slate-700">
              {display(address.street)}
              <br />
              {display(address.city)}, {display(address.state)} {display(address.zip)}
            </address>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {!isPlaceholder(business.mapUrl) && (
                <a
                  href={business.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-brand-600 px-6 py-3 text-center font-semibold text-white transition hover:bg-brand-700"
                >
                  Open in Maps
                </a>
              )}
              <a
                href={telHref(business.phoneHref)}
                className="rounded-lg border border-slate-300 px-6 py-3 text-center font-semibold text-slate-800 transition hover:bg-slate-50"
              >
                Call {display(business.phone)}
              </a>
            </div>

            <dl className="mt-10 space-y-4">
              <div>
                <dt className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Phone
                </dt>
                <dd className="mt-1 text-lg">
                  <a href={telHref(business.phoneHref)} className="text-brand-700 hover:underline">
                    {display(business.phone)}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Email
                </dt>
                <dd className="mt-1 text-lg">
                  <a href={mailtoHref(business.email)} className="text-brand-700 hover:underline">
                    {display(business.email)}
                  </a>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </Section>
    </>
  );
}
