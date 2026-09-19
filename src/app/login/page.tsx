"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { WashingMachine, Loader2, ArrowLeft, X, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  loadAccounts,
  rememberAccount,
  forgetAccount,
  type RememberedAccount,
} from "@/lib/accounts";

/**
 * NextAuth surfaces a thrown authorize() error as a string. Lockouts are
 * tagged so they can be shown verbatim, while everything else collapses to one
 * generic message that does not reveal whether the account exists.
 */
function readableError(raw: string | undefined): string {
  if (!raw) return "";
  const marker = raw.indexOf("LOCKED:");
  if (marker !== -1) return raw.slice(marker + "LOCKED:".length);
  return "Those credentials did not work.";
}

export default function LoginPage() {
  const router = useRouter();

  const [accounts, setAccounts] = useState<RememberedAccount[]>([]);
  const [chosen, setChosen] = useState<RememberedAccount | null>(null);
  const [manual, setManual] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [usePassword, setUsePassword] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setAccounts(loadAccounts());
  }, []);

  const showPicker = accounts.length > 0 && !chosen && !manual;
  const pinAvailable = Boolean(chosen?.deviceToken) && !usePassword;

  function choose(account: RememberedAccount) {
    setChosen(account);
    setEmail(account.email);
    setUsePassword(!account.deviceToken);
    setError("");
  }

  function backToPicker() {
    setChosen(null);
    setManual(false);
    setEmail("");
    setPassword("");
    setPin("");
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      ...(pinAvailable
        ? { pin, deviceToken: chosen?.deviceToken }
        : { password }),
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError(readableError(result.error));
      setPin("");
      return;
    }

    rememberAccount({ email, name: chosen?.name ?? email.split("@")[0]! });
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-2 mb-2">
            <WashingMachine className="h-8 w-8 text-blue-400" />
            <span className="text-2xl font-bold text-white tracking-tight">Laundroweb</span>
          </div>
          <p className="text-gray-400 text-sm">
            {showPicker ? "Choose an account" : "Sign in to your dashboard"}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          {showPicker ? (
            <div className="space-y-2">
              {accounts.map((account) => (
                <div key={account.email} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => choose(account)}
                    className="flex-1 flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-3 text-left hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-700 flex-shrink-0">
                      <UserRound className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-900 truncate">
                        {account.name}
                      </span>
                      <span className="block text-xs text-gray-500 truncate">
                        {account.deviceToken ? "PIN enabled" : account.email}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    title={`Forget ${account.name} on this device`}
                    onClick={() => {
                      forgetAccount(account.email);
                      setAccounts(loadAccounts());
                    }}
                    className="p-2 rounded-md text-gray-300 hover:text-gray-600 hover:bg-gray-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setManual(true)}
                className="w-full text-sm text-blue-600 hover:text-blue-700 pt-2"
              >
                Use a different account
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {(chosen || manual) && accounts.length > 0 && (
                <button
                  type="button"
                  onClick={backToPicker}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
                >
                  <ArrowLeft className="h-3 w-3" />
                  All accounts
                </button>
              )}

              {chosen ? (
                <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                    <UserRound className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{chosen.name}</p>
                    <p className="text-xs text-gray-500 truncate">{chosen.email}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
              )}

              {pinAvailable ? (
                <div className="space-y-1.5">
                  <Label htmlFor="pin">PIN</Label>
                  <Input
                    id="pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••"
                    required
                    autoFocus
                    autoComplete="off"
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoFocus={Boolean(chosen)}
                    autoComplete="current-password"
                  />
                </div>
              )}

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {pinAvailable ? "Unlock" : "Sign in"}
              </Button>

              {chosen?.deviceToken && (
                <button
                  type="button"
                  onClick={() => {
                    setUsePassword((v) => !v);
                    setError("");
                    setPin("");
                    setPassword("");
                  }}
                  className="w-full text-xs text-blue-600 hover:text-blue-700"
                >
                  {usePassword ? "Use PIN instead" : "Use password instead"}
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
