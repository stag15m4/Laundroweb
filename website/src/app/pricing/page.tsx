import type { Metadata } from "next";
import { Section } from "@/components/Section";
import { Container } from "@/components/Container";
import { pricing, payment, equipment } from "@/content/site";
import { display } from "@/content/util";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Wash and dry prices by machine size, plus laundry supplies available in store.",
};

function PriceTable({
  caption,
  rows,
  labelHeading,
}: {
  caption: string;
  rows: readonly { readonly size?: string; readonly item?: string; readonly price: string }[];
  labelHeading: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full text-left">
        <caption className="bg-slate-50 px-6 py-4 text-left text-lg font-semibold text-slate-900">
          {caption}
        </caption>
        <thead className="border-y border-slate-200 bg-white">
          <tr>
            <th scope="col" className="px-6 py-3 text-sm font-semibold text-slate-700">
              {labelHeading}
            </th>
            <th scope="col" className="px-6 py-3 text-right text-sm font-semibold text-slate-700">
              Price
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row) => {
            const label = row.size ?? row.item ?? "";
            return (
              <tr key={label}>
                <th scope="row" className="px-6 py-4 font-medium text-slate-900">
                  {label}
                </th>
                <td className="px-6 py-4 text-right tabular-nums text-slate-700">
                  {display(row.price)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PricingPage() {
  return (
    <>
      <div className="bg-slate-900 text-white">
        <Container className="py-16">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Pricing</h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-300">
            Pay for the machine that fits your load. Bigger drums cost more per
            cycle but far less per pound — one 60 lb wash beats three small ones
            on both price and time.
          </p>
        </Container>
      </div>

      <Section>
        <div className="grid gap-8 lg:grid-cols-2">
          <PriceTable caption="Washers" labelHeading="Capacity" rows={pricing.washers} />
          <PriceTable caption="Dryers" labelHeading="Capacity" rows={pricing.dryers} />
        </div>

        {pricing.vending && (
          <div className="mt-8 max-w-xl">
            <PriceTable caption="Supplies in store" labelHeading="Item" rows={pricing.vending} />
          </div>
        )}

        <p className="mt-8 text-sm text-slate-500">
          Prices are subject to change. Posted prices in store are authoritative.
        </p>
      </Section>

      <Section tone="muted" title="How to pay">
        <div className="grid gap-6 sm:grid-cols-2">
          {[payment.coin, payment.card].map((p) => (
            <div key={p.title} className="rounded-xl bg-white p-8 shadow-sm">
              <h2 className="text-lg font-semibold">{p.title}</h2>
              <p className="mt-2 leading-relaxed text-slate-600">{p.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Picking the right machine">
        <div className="max-w-3xl space-y-4 leading-relaxed text-slate-600">
          <p>
            <strong className="text-slate-900">20 lb</strong> handles roughly one
            full home hamper — a good choice for a single person's weekly load or
            a separate delicates run.
          </p>
          <p>
            <strong className="text-slate-900">30 lb</strong> is about three
            regular home loads. For most families this is the everyday machine:
            one wash instead of three.
          </p>
          <p>
            <strong className="text-slate-900">60 lb</strong> is for the things
            that do not fit anywhere else — king comforters, sleeping bags,
            mattress pads, or a week of laundry for a full household in a single
            cycle.
          </p>
          <p>
            All {equipment.washers.reduce((n, w) => n + w.count, 0)} washers are{" "}
            {equipment.brand} commercial units with a high-speed extract, which
            pulls more water out before the dryer. That means less dryer time and
            less money spent drying.
          </p>
        </div>
      </Section>
    </>
  );
}
