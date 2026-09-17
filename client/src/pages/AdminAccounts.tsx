/**
 * Who has an account, and what it has cost.
 *
 * Built like AdminStats and AdminCosts and for the same reasons: tables rather
 * than charts (three accounts today, and a chart of three implies a trend that
 * is not there), useEffect over react-query because these pages are read once
 * by one person, and a 403 rendered as a card carrying the server's own
 * sentence rather than thrown as an error.
 *
 * COUNTS AND MONEY, NEVER CONTENT. The endpoint behind this refuses to return
 * a story title, a character name or a prompt, and this page must never grow a
 * column that wants one. Knowing an account spent nine dollars yesterday is
 * running a service; reading what somebody's child asked for is not.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { apiRequestAllowingErrors } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

type Account = {
  id: number;
  username: string;
  email: string;
  isAdmin: boolean;
  isVerified: boolean;
  bannedAt: string | null;
  bannedReason: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  signupIp: string | null;
  creditsUsed: number;
  creditsLeft: number;
  portraits: number;
  stories: number;
  storiesFailed: number;
  pictures: number;
  spentMicros: number | null;
  unpricedCalls: number;
  lastActivityAt: string | null;
};

type AccountList = { windowDays: number; accounts: Account[] };

type Detail = {
  account?: Account;
  windowDays: number;
  perMonth: number;
  spend: { label: string; calls: number; micros: number | null }[];
  failures: { code: string; n: number }[];
  daily: { day: string; stories: number }[];
};

/** Micros as money a person reads. The same shape AdminCosts uses. */
const money = (micros: number | null) => {
  if (micros === null) return "—";
  const usd = micros / 1_000_000;
  return usd >= 1 ? `$${usd.toFixed(2)}` : `${(usd * 100).toFixed(2)}¢`;
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "never";

export default function AdminAccounts() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [list, setList] = useState<AccountList | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState<number | null>(null);
  const [reload, setReload] = useState(0);

  /**
   * Ban or unban, then reload from the server rather than patching the row
   * here: what a ban did -- how many jobs it stopped -- is the server's answer,
   * and a list that guesses is a list that can be wrong on screen.
   */
  const setBanned = async (account: Account, banned: boolean) => {
    if (banned) {
      const reason = window.prompt(
        `Ban ${account.username}?\n\nThey are signed out at once and cannot sign in. Their stories, characters and credits are kept, and unbanning gives them all back. Any story being written right now stops at its next chapter -- that chapter is still paid for, and cancelled stories do not come back.\n\nWhy (for your own records, optional):`,
        "",
      );
      if (reason === null) return;
      setBusy(account.id);
      const res = await apiRequestAllowingErrors("POST", `/api/admin/accounts/${account.id}/ban`, { reason });
      const body = await res.json().catch(() => ({}));
      setBusy(null);
      if (!res.ok) return setError(body.message || "Could not ban that account");
    } else {
      setBusy(account.id);
      const res = await apiRequestAllowingErrors("POST", `/api/admin/accounts/${account.id}/unban`);
      const body = await res.json().catch(() => ({}));
      setBusy(null);
      if (!res.ok) return setError(body.message || "Could not unban that account");
    }
    setReload((n) => n + 1);
  };

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      // Non-throwing: a 403 here is a normal answer for a non-admin, and we
      // want to say so rather than surface an exception.
      const response = await apiRequestAllowingErrors("GET", `/api/admin/accounts?days=${days}`);
      const body = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (!response.ok) {
        setError(body.message || "Could not load accounts");
        setList(null);
      } else {
        setError(null);
        setList(body as AccountList);
      }
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [days, reload]);

  useEffect(() => {
    if (openId === null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const response = await apiRequestAllowingErrors("GET", `/api/admin/accounts/${openId}?days=${days}`);
      const body = await response.json().catch(() => ({}));
      if (!cancelled && response.ok) setDetail(body as Detail);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [openId, days]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="max-w-2xl mx-auto bg-card">
        <CardContent className="p-8 text-center">
          <h2 className="text-xl font-medium mb-2">Accounts unavailable</h2>
          <p className="text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!list) return null;

  const spent = list.accounts.reduce((a, x) => a + (x.spentMicros ?? 0), 0);
  const unpriced = list.accounts.reduce((a, x) => a + x.unpricedCalls, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-3xl font-heading font-bold text-secondary">Accounts</h2>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <Button key={d} size="sm" variant={d === days ? "default" : "outline"} onClick={() => setDays(d)}>
              {d} days
            </Button>
          ))}
        </div>
      </div>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>
            {list.accounts.length} {list.accounts.length === 1 ? "account" : "accounts"}
          </CardTitle>
          <CardDescription>
            {money(spent)} of model calls over {list.windowDays} days
            {unpriced > 0 ? ` · ${unpriced} calls have no price yet, so that is a floor` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="py-2">Who</th>
                <th>Joined</th>
                <th>Last in</th>
                <th className="text-right">Credits</th>
                <th className="text-right">Stories</th>
                <th className="text-right">Pictures</th>
                <th className="text-right">Cost</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.accounts.map((a) => (
                <tr
                  key={a.id}
                  className="border-b last:border-0 cursor-pointer hover:bg-muted/40"
                  onClick={() => setOpenId(openId === a.id ? null : a.id)}
                >
                  <td className="py-2">
                    <div className="font-medium">
                      {a.username}
                      {a.isAdmin && (
                        <span className="ml-2 rounded bg-secondary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                          admin
                        </span>
                      )}
                      {a.bannedAt && (
                        <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-destructive">
                          banned
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{a.email}</div>
                  </td>
                  <td>{when(a.createdAt)}</td>
                  <td>{when(a.lastLoginAt)}</td>
                  {/* An admin is never charged, so a balance for one is a
                      number that means nothing. Say so rather than show 50. */}
                  <td className="text-right">{a.isAdmin ? "—" : `${a.creditsUsed} used, ${a.creditsLeft} left`}</td>
                  <td className="text-right">
                    {a.stories}
                    {a.storiesFailed > 0 && (
                      <span className="text-muted-foreground"> ({a.storiesFailed} failed)</span>
                    )}
                  </td>
                  <td className="text-right">{a.pictures}</td>
                  <td className="text-right">{money(a.spentMicros)}</td>
                  <td className="text-right">
                    {/* stopPropagation: the row opens the detail, and a click
                        that both bans somebody and opens their page is a click
                        nobody meant to make. */}
                    <Button
                      size="sm"
                      variant={a.bannedAt ? "outline" : "ghost"}
                      disabled={busy === a.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void setBanned(a, !a.bannedAt);
                      }}
                    >
                      {busy === a.id ? "…" : a.bannedAt ? "Unban" : "Ban"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {detail?.account && (
        <Card className="bg-card">
          <CardHeader>
            <CardTitle>{detail.account.username}</CardTitle>
            <CardDescription>
              {detail.account.isAdmin ? "An admin: never charged." : `${detail.account.creditsLeft} credits left, ${detail.perMonth} more each month.`}
              {detail.account.signupIp ? ` Signed up from ${detail.account.signupIp}.` : ""}
              {detail.account.lastActivityAt ? ` Last wrote something ${when(detail.account.lastActivityAt)}.` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 overflow-x-auto">
            <div>
              <h3 className="mb-2 font-medium">What the money went on</h3>
              {detail.spend.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing in this window.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground border-b">
                    <tr>
                      <th className="py-2">Call</th>
                      <th className="text-right">Times</th>
                      <th className="text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.spend.map((line) => (
                      <tr key={line.label} className="border-b last:border-0">
                        <td className="py-2">{line.label}</td>
                        <td className="text-right">{line.calls}</td>
                        <td className="text-right">{money(line.micros)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {detail.failures.length > 0 && (
              <div>
                <h3 className="mb-2 font-medium">Why generations failed</h3>
                <ul className="ml-5 list-disc space-y-1 text-sm">
                  {detail.failures.map((f) => (
                    <li key={f.code}>
                      {f.code.replace(/_/g, " ")} — {f.n}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.daily.length > 0 && (
              <div>
                <h3 className="mb-2 font-medium">Stories a day</h3>
                <table className="w-full text-sm">
                  <tbody>
                    {detail.daily.map((d) => (
                      <tr key={d.day} className="border-b last:border-0">
                        <td className="py-1">{d.day}</td>
                        <td className="text-right">{d.stories}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
