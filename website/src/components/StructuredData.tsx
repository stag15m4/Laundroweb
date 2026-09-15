import { business, hours, faqs } from "@/content/site";
import { orUndefined } from "@/content/util";

/**
 * Emits LocalBusiness + FAQPage JSON-LD.
 *
 * For a laundromat this is the highest-value SEO on the whole site: it is what
 * lets Google show hours, address, and phone directly in local results and in
 * Maps. Fields that are still placeholders are omitted rather than published.
 */
export function StructuredData() {
  const street = orUndefined(business.address.street);
  const city = orUndefined(business.address.city);
  const state = orUndefined(business.address.state);
  const zip = orUndefined(business.address.zip);

  const openingHours = hours
    .map((h) => {
      const value = orUndefined(h.open);
      if (!value) return null;
      // "6:00 AM – 10:00 PM" → { opens: "06:00", closes: "22:00" }
      const parsed = parseRange(value);
      if (!parsed) return null;
      return {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: `https://schema.org/${h.day}`,
        opens: parsed.opens,
        closes: parsed.closes,
      };
    })
    .filter(Boolean);

  const localBusiness = {
    "@context": "https://schema.org",
    "@type": "Laundromat",
    name: business.name,
    description: business.tagline,
    url: orUndefined(business.siteUrl),
    telephone: orUndefined(business.phone),
    email: orUndefined(business.email),
    hasMap: orUndefined(business.mapUrl),
    ...(street || city
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: street,
            addressLocality: city,
            addressRegion: state,
            postalCode: zip,
            addressCountry: "US",
          },
        }
      : {}),
    ...(openingHours.length ? { openingHoursSpecification: openingHours } : {}),
    paymentAccepted: "Cash, Coins, Credit Card, Debit Card, Contactless",
  };

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusiness) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }}
      />
    </>
  );
}

/** Parses "6:00 AM – 10:00 PM" into 24-hour schema.org times. */
function parseRange(value: string): { opens: string; closes: string } | null {
  const parts = value.split(/[–—-]/).map((s) => s.trim());
  if (parts.length !== 2) return null;
  const opens = to24Hour(parts[0]);
  const closes = to24Hour(parts[1]);
  return opens && closes ? { opens, closes } : null;
}

function to24Hour(value: string): string | null {
  const m = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ?? "00";
  const meridiem = m[3].toUpperCase();
  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}
