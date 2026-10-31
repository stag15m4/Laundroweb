"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LanguageProvider, useLanguage } from "@/lib/i18n/LanguageProvider";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { localDateToIso } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

const NOT_SURE = "__NOT_SURE__";

type Machine = { id: string; name: string; type: string };

function initialState() {
  return {
    machineId: "",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    issueDate: format(new Date(), "yyyy-MM-dd"),
    description: "",
    amountRequested: "",
  };
}

function RefundRequestFormInner() {
  const { t } = useLanguage();

  const [machines, setMachines] = useState<Machine[]>([]);
  const [form, setForm] = useState(initialState());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/refund-requests/machines")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setMachines(d))
      .catch(() => {});
  }, []);

  function update<K extends keyof ReturnType<typeof initialState>>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.customerName.trim() || !form.description.trim() || !form.machineId) {
      setError(t("errorRequired"));
      return;
    }
    if (!form.customerPhone.trim() && !form.customerEmail.trim()) {
      setError(t("errorContact"));
      return;
    }

    const selected = machines.find((m) => m.id === form.machineId);
    const machineLabel = selected ? selected.name : t("machineNotSure");

    setSubmitting(true);
    const res = await fetch("/api/refund-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        machineId: form.machineId === NOT_SURE ? null : form.machineId,
        machineLabel,
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim() || null,
        customerEmail: form.customerEmail.trim() || null,
        issueDate: localDateToIso(form.issueDate),
        description: form.description.trim(),
        amountRequested: form.amountRequested === "" ? null : Number(form.amountRequested),
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      setError(t("errorGeneric"));
      return;
    }
    setSubmitted(true);
  }

  function startOver() {
    setForm(initialState());
    setSubmitted(false);
    setError("");
  }

  if (submitted) {
    return (
      <div className="text-center py-6">
        <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-gray-900">{t("successTitle")}</h2>
        <p className="text-sm text-gray-500 mt-1">{t("successMessage")}</p>
        <Button variant="outline" className="mt-5" onClick={startOver}>
          {t("newRequestButton")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>{t("machineLabel")}</Label>
        <Select value={form.machineId} onValueChange={(v) => update("machineId", v)}>
          <SelectTrigger>
            <SelectValue placeholder={t("machinePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {machines.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
            <SelectItem value={NOT_SURE}>{t("machineNotSure")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>{t("nameLabel")}</Label>
        <Input value={form.customerName} onChange={(e) => update("customerName", e.target.value)} required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t("phoneLabel")}</Label>
          <Input
            type="tel"
            value={form.customerPhone}
            onChange={(e) => update("customerPhone", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("emailLabel")}</Label>
          <Input
            type="email"
            value={form.customerEmail}
            onChange={(e) => update("customerEmail", e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-gray-400">{t("contactHint")}</p>

      <div className="space-y-1.5">
        <Label>{t("dateLabel")}</Label>
        <Input
          type="date"
          value={form.issueDate}
          onChange={(e) => update("issueDate", e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label>{t("descriptionLabel")}</Label>
        <Textarea
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder={t("descriptionPlaceholder")}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label>{t("amountLabel")}</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={form.amountRequested}
          onChange={(e) => update("amountRequested", e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? t("submittingButton") : t("submitButton")}
      </Button>
    </form>
  );
}

export function RefundRequestForm() {
  return (
    <LanguageProvider>
      <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-6">
            <LanguageSwitcher />
          </div>

          <div className="flex flex-col items-center mb-6">
            <Image
              src="/logo-hero.png"
              alt="Laundroweb"
              width={450}
              height={360}
              priority
              className="h-20 w-auto mb-2"
            />
            <HeaderText />
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <RefundRequestFormInner />
          </div>
        </div>
      </div>
    </LanguageProvider>
  );
}

function HeaderText() {
  const { t } = useLanguage();
  return (
    <>
      <span className="text-xl font-bold text-white tracking-tight">{t("pageTitle")}</span>
      <p className="text-gray-400 text-sm mt-1 text-center">{t("pageSubtitle")}</p>
    </>
  );
}
