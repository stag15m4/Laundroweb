"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ServiceLocation, mapsUrl } from "@/lib/wdf-location";

type CustomerAddresses = { version: number; billingAddress: string | null; deliveryLocation: ServiceLocation | null };
type Match = { location: ServiceLocation; token: string };
async function json(url: string, body?: unknown) {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Could not load addresses.");
  return data;
}

export function ServiceAddresses({ customerId, onSaved }: { customerId: string; onSaved?: () => void }) {
  const [customer, setCustomer] = useState<CustomerAddresses | null>(null);
  const [billing, setBilling] = useState(""), [address, setAddress] = useState("");
  const [matches, setMatches] = useState<Match[]>([]), [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const lock = useRef(false), generation = useRef(0);
  function useCustomer(value: CustomerAddresses) {
    setCustomer(value); setBilling(value.billingAddress || ""); setAddress(value.deliveryLocation?.inputAddress || "");
    setMatches([]); setSelected("");
  }
  async function reload() { useCustomer((await json("/api/wdf?customerId=" + encodeURIComponent(customerId))).customer); }
  useEffect(() => {
    const current = ++generation.current;
    setCustomer(null); setError(""); setNotice(""); setMatches([]); setSelected("");
    json("/api/wdf?customerId=" + encodeURIComponent(customerId)).then(d => { if (generation.current === current) useCustomer(d.customer); })
      .catch(e => { if (generation.current === current) setError(e.message); });
    return () => { generation.current++; };
  }, [customerId]);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  const chosen = matches.find(m => m.token === selected);
  const unchanged = address.trim() === customer?.deliveryLocation?.inputAddress;
  const location = chosen?.location ?? (unchanged ? customer?.deliveryLocation : null);
  return <section className="rounded-xl border bg-white p-4 sm:p-6 space-y-4">
    <h3 className="font-semibold text-lg">Billing, delivery and linen location</h3>
    {error && <p role="alert" className="text-sm text-red-700">{error} <button type="button" disabled={busy} className="underline" onClick={() => run(reload)}>Reload saved addresses</button></p>}
    {notice && <p role="status" className="text-sm text-blue-800">{notice}</p>}
    {!customer ? <p className="text-sm">Loading addresses…</p> : <form className="space-y-4" onSubmit={e => {
      e.preventDefault(); run(async () => {
        const result = await json("/api/wdf", { action: "customer.addresses", customerId, version: customer.version,
          billingAddress: billing, deliveryAddress: address, locationToken: chosen?.token });
        useCustomer(result.customer); setNotice("Addresses saved. Earlier invoices keep their original locations."); onSaved?.();
      });
    }}>
      <label className="block space-y-1 text-sm font-medium"><span>Billing / mailing address (optional)</span><Input disabled={busy} maxLength={500} value={billing} onChange={e => setBilling(e.target.value)} placeholder="Street, suite, city, state and ZIP" /></label>
      <label className="block space-y-1 text-sm font-medium"><span>Delivery / primary linen location</span><Input disabled={busy} maxLength={500} value={address} onChange={e => { setAddress(e.target.value); setMatches([]); setSelected(""); setNotice(""); }} placeholder="Full street address, city, NC and ZIP" /></label>
      <Button type="button" variant="outline" disabled={busy || !address.trim()} onClick={() => run(async () => {
        setMatches([]); setSelected("");
        const result = await json("/api/wdf/geocode", { customerId, address: address.trim() });
        setMatches(result.matches); setNotice(result.message);
      })}>{busy ? "Working…" : "Look up address and county"}</Button>
      {matches.length > 0 && <fieldset className="space-y-3 rounded border p-3"><legend className="text-sm font-medium px-1">Choose the correct address match</legend>
        {matches.map(m => <div key={m.token} className="space-y-1 text-sm">
          <label className="flex gap-2"><input type="radio" name={"address-" + customerId} disabled={busy} checked={selected === m.token} onChange={() => setSelected(m.token)} />
            <span>{m.location.matchedAddress}<br /><strong>{m.location.county}, {m.location.state}</strong></span></label>
          <a className="text-blue-700 underline ml-5" href={mapsUrl(m.location)} target="_blank" rel="noopener noreferrer">Review map pin</a>
        </div>)}
      </fieldset>}
      {location && <div className="text-sm rounded bg-gray-50 p-3 space-y-1"><p>{location.matchedAddress}</p><p>{location.county} · County FIPS {location.countyFips}</p>
        <a className="text-blue-700 underline" href={mapsUrl(location)} target="_blank" rel="noopener noreferrer">Open in Maps</a>
        {location.confirmedAt && !chosen && <p className="text-xs text-gray-500">Reviewed by {location.confirmedByName} on {new Date(location.confirmedAt).toLocaleDateString()}</p>}
      </div>}
      <p className="text-xs text-gray-500">Lookup sends this street address to the U.S. Census geocoder. Pins are approximate. Review the match and county before confirming; a match does not certify deliverability or a tax rate. Include any unit/suite in the entered address. This location is used for delivered WDF and as the primary location of rented linens. Billing address alone does not determine the tax county.</p>
      {!!address.trim() && !unchanged && !chosen && <p className="text-sm text-amber-800">Look up the address and choose a match before saving.</p>}
      <Button disabled={busy || (!!address.trim() && !unchanged && !chosen)}>{chosen ? "Confirm match and save addresses" : "Save addresses"}</Button>
      {customer.deliveryLocation && !address.trim() && <p className="text-sm text-amber-800">Saving will remove this customer's delivery location. Existing invoices are retained.</p>}
    </form>}
  </section>;
}
