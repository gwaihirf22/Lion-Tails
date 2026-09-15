/**
 * What things really cost, the prices OpenAI charges, and the price list.
 *
 * The same shape as AdminStats, for the same reasons: tables, not charts, and
 * small samples said out loud. Everything here is read from one endpoint and
 * every change is a button that asks the server to do it -- the page never
 * computes a price itself, so it cannot disagree with what was published.
 */
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Eye, Loader2, RefreshCw } from "lucide-react";
import { apiRequestAllowingErrors } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

type Warning = { level: "action" | "watch"; code: string; message: string };
type CostGroup = { item: string; label: string; n: number; medianMicros?: number; p75Micros?: number; maxMicros?: number; enough: boolean };
type Change = { model: string; unit: string; from?: number; to?: number };
type Conflict = { model: string; unit: string; litellm: number; page: number };
type Proposal = {
  id: number;
  createdAt: string;
  source: string;
  note: string | null;
  evidence: { changes?: Change[]; conflicts?: Conflict[]; missing?: { litellm?: string[]; page?: string[] } } | null;
};
type SourceStatus = { ok: boolean; at: string; error?: string; missing?: string[]; problems?: string[] };
type Report = {
  warnings: Warning[];
  proposals: Proposal[];
  approved: Record<string, { sheet: Record<string, number>; versionId?: number }>;
  catalogue: Array<{ model: string; label: string }>;
  stories: { items: CostGroup[]; splits: CostGroup[]; incomplete: number };
  pictures: CostGroup[];
  marginPct: number;
  suggested: Array<{ item: string; label: string; priceCents: number; basisMicros: number; samples: number }>;
  published: { versionId: number; createdAt: string; marginPct: number; items: Array<{ item: string; priceCents: number }> } | null;
  watch: { lastRunAt?: string; litellm?: SourceStatus; page?: SourceStatus } | null;
  bill: {
    at: string;
    ok: boolean;
    error?: string;
    rates: Array<{ model: string; unit: string; charged: number; approved?: number; off: boolean }>;
    unpriced?: string[];
    window?: { from: string; to: string; billedUsd: number; listValueUsd: number; freeValueUsd: number; ledgerUsd: number; drift: number; off: boolean };
  } | null;
  billCheckEnabled: boolean;
  billProjectScoped: boolean;
  windowDays: number;
};

/** Micros as money a person reads: $0.0123, or 1.23¢ when under a dollar. */
const money = (micros?: number) => {
  if (micros === undefined) return "—";
  const usd = micros / 1_000_000;
  return usd >= 1 ? `$${usd.toFixed(2)}` : `${(usd * 100).toFixed(2)}¢`;
};
const unitLabel = (u: string) => u.replace(/_/g, " ");
const UNITS = ["input_text", "input_cached", "input_cache_write", "input_image", "input_image_cached", "output_text", "output_image"];

export default function AdminCosts() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [margin, setMargin] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  const load = useCallback(async () => {
    const response = await apiRequestAllowingErrors("GET", "/api/admin/costs");
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message || "Could not load costs");
      return;
    }
    const data = (await response.json()) as Report;
    setReport(data);
    setMargin(String(data.marginPct));
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (key: string, method: string, url: string, body?: unknown, done?: string) => {
    setBusy(key);
    try {
      const response = await apiRequestAllowingErrors(method, url, body);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast({ title: "That did not work", description: data.message, variant: "destructive" });
        return;
      }
      if (done) toast({ title: done });
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <Card className="max-w-2xl mx-auto bg-card">
        <CardContent className="p-8 text-center">
          <h2 className="text-xl font-medium mb-2">Costs unavailable</h2>
          <p className="text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }
  if (!report) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const published = new Map((report.published?.items ?? []).map((i) => [i.item, i.priceCents]));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-3xl font-heading font-bold text-secondary">Costs and prices</h2>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act("check", "POST", "/api/admin/prices/check", undefined, "Prices checked")}>
          {busy === "check" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Check now
        </Button>
      </div>

      {/* 1. Warnings */}
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Warnings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {report.warnings.length === 0 && <p className="text-sm text-muted-foreground">Nothing needs attention.</p>}
          {report.warnings.map((w, i) => (
            <div
              key={`${w.code}-${i}`}
              className={
                w.level === "action"
                  ? "flex gap-2 rounded-md border border-warning bg-warning-surface p-3 text-sm text-warning"
                  : "flex gap-2 rounded-md border p-3 text-sm text-muted-foreground"
              }
            >
              {w.level === "action" ? <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> : <Eye className="h-4 w-4 shrink-0 mt-0.5" />}
              <span>{w.message}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 2. Proposals */}
      {report.proposals.map((p) => (
        <Card key={p.id} className="bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Proposed prices #{p.id}</CardTitle>
            <CardDescription>
              Filed {p.createdAt.slice(0, 16).replace("T", " ")} from {p.source}. {p.note} Dollars per million tokens.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-4">Model</th>
                    <th className="py-2 pr-4">Unit</th>
                    <th className="py-2 pr-4">Approved now</th>
                    <th className="py-2 pr-4">Proposed</th>
                  </tr>
                </thead>
                <tbody>
                  {(p.evidence?.changes ?? []).map((c) => (
                    <tr key={`${c.model}-${c.unit}`} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{c.model}</td>
                      <td className="py-2 pr-4">{unitLabel(c.unit)}</td>
                      <td className="py-2 pr-4">{c.from === undefined ? "none" : `$${c.from}`}</td>
                      <td className="py-2 pr-4">{c.to === undefined ? "not in the feeds (kept)" : `$${c.to}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(p.evidence?.conflicts ?? []).length > 0 && (
              <div className="rounded-md border border-warning bg-warning-surface p-3 text-sm text-warning">
                The two feeds disagree; OpenAI's own page was used:{" "}
                {p.evidence!.conflicts!.map((c) => `${c.model} ${unitLabel(c.unit)} (LiteLLM $${c.litellm}, OpenAI $${c.page})`).join("; ")}.
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy !== null} onClick={() => act(`approve-${p.id}`, "POST", `/api/admin/prices/${p.id}/approve`, undefined, "Prices approved")}>
                {busy === `approve-${p.id}` && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Approve these prices
              </Button>
              <Button variant="outline" disabled={busy !== null} onClick={() => act(`dismiss-${p.id}`, "POST", `/api/admin/prices/${p.id}/dismiss`, undefined, "Proposal dismissed")}>
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* 3. Real costs */}
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-lg">What a story really costs</CardTitle>
          <CardDescription>
            Measured from the last {report.windowDays} days, retries and world extraction included; the cover is
            below. p75 is what three stories in four cost at most, and it is what prices are built on.
            {report.stories.incomplete > 0 && ` ${report.stories.incomplete} stories are left out because a call in them had no approved price.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <CostTable groups={report.stories.items} empty="No finished stories with a known cost yet." />
          {report.stories.splits.length > report.stories.items.length && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-muted-foreground">Quests and digging deeper, separately</summary>
              <CostTable groups={report.stories.splits} empty="" />
            </details>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-lg">What a picture really costs</CardTitle>
          <CardDescription>Each image call on its own. A passage picture also pays for its scene description, listed as its own row.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <CostTable groups={report.pictures} empty="No priced pictures yet." />
        </CardContent>
      </Card>

      {/* 4. Price list */}
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Price list</CardTitle>
          <CardDescription>
            Suggested = p75 cost plus the margin, rounded up to a cent. Nothing changes for anyone until you publish.
            {report.published
              ? ` Published ${report.published.createdAt.slice(0, 10)} at ${report.published.marginPct}% margin.`
              : " Nothing is published yet."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="block text-muted-foreground mb-1">Margin %</span>
              <Input className="w-24" type="number" min={0} max={200} value={margin} onChange={(e) => setMargin(e.target.value)} />
            </label>
            <Button
              variant="outline"
              disabled={busy !== null || margin === String(report.marginPct) || margin === ""}
              onClick={() => act("margin", "PUT", "/api/admin/pricing/margin", { marginPct: Number(margin) }, "Margin saved")}
            >
              Save margin
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-4">Item</th>
                  <th className="py-2 pr-4">Cost (p75)</th>
                  <th className="py-2 pr-4">Samples</th>
                  <th className="py-2 pr-4">Suggested</th>
                  <th className="py-2 pr-4">Published</th>
                </tr>
              </thead>
              <tbody>
                {report.suggested.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-3 text-muted-foreground">
                      Nothing has enough measured samples to price yet.
                    </td>
                  </tr>
                )}
                {report.suggested.map((s) => (
                  <tr key={s.item} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{s.label}</td>
                    <td className="py-2 pr-4">{money(s.basisMicros)}</td>
                    <td className="py-2 pr-4">{s.samples}</td>
                    <td className="py-2 pr-4">{s.priceCents}¢</td>
                    <td className="py-2 pr-4">{published.has(s.item) ? `${published.get(s.item)}¢` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button disabled={busy !== null || report.suggested.length === 0} onClick={() => act("publish", "POST", "/api/admin/pricing/publish", undefined, "Price list published")}>
            Publish this list
          </Button>
        </CardContent>
      </Card>

      {/* Approved prices */}
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Approved prices</CardTitle>
          <CardDescription>Dollars per million tokens, as every new call is costed now.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="py-2 pr-4">Model</th>
                {UNITS.map((u) => (
                  <th key={u} className="py-2 pr-4">{unitLabel(u)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.catalogue.map(({ model }) => (
                <tr key={model} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium">{model}</td>
                  {UNITS.map((u) => (
                    <td key={u} className="py-2 pr-4">
                      {report.approved[model]?.sheet[u] !== undefined ? `$${report.approved[model].sheet[u]}` : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* 5. Watcher status */}
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Where prices come from</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Last checked: {report.watch?.lastRunAt ? report.watch.lastRunAt.slice(0, 16).replace("T", " ") : "never"}. Checked
            daily.
          </p>
          <SourceLine name="LiteLLM price file" status={report.watch?.litellm} />
          <SourceLine name="OpenAI pricing page" status={report.watch?.page} />
          <p>
            Bill check:{" "}
            {!report.billCheckEnabled
              ? "off (no COSTS_ADMIN_KEY)."
              : report.bill
                ? report.bill.ok
                  ? `ran ${report.bill.at.slice(0, 16).replace("T", " ")}, ${report.billProjectScoped ? "for this app's project" : "for the whole organisation"}.`
                  : `failed: ${report.bill.error}`
                : "on, not yet run."}
          </p>
          {report.bill?.ok && report.bill.window && (
            <p className="text-muted-foreground">
              {report.bill.window.from.slice(0, 10)} to {report.bill.window.to.slice(0, 10)}: OpenAI charged $
              {report.bill.window.billedUsd.toFixed(2)}
              {report.bill.window.freeValueUsd > 0.005 &&
                ` (free usage worth $${report.bill.window.freeValueUsd.toFixed(2)} at list price)`}
              . At list price the bill is ${report.bill.window.listValueUsd.toFixed(2)} and the ledger recorded $
              {report.bill.window.ledgerUsd.toFixed(2)} ({Math.round(report.bill.window.drift * 100)}% apart).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SourceLine({ name, status }: { name: string; status?: SourceStatus }) {
  if (!status) return <p>{name}: not checked yet.</p>;
  return (
    <p className={status.ok ? "" : "text-warning"}>
      {name}: {status.ok ? "read" : `problem — ${status.error ?? status.problems?.join(" ") ?? "unknown"}`}
      {status.missing?.length ? ` (no price for ${status.missing.join(", ")})` : ""}
    </p>
  );
}

function CostTable({ groups, empty }: { groups: CostGroup[]; empty: string }) {
  if (groups.length === 0) return empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-muted-foreground border-b">
        <tr>
          <th className="py-2 pr-4">What</th>
          <th className="py-2 pr-4">Samples</th>
          <th className="py-2 pr-4">Median</th>
          <th className="py-2 pr-4">p75</th>
          <th className="py-2 pr-4">Most</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => (
          <tr key={g.item} className="border-b last:border-0">
            <td className="py-2 pr-4 font-medium">{g.label}</td>
            <td className="py-2 pr-4">
              {g.n}
              {!g.enough && <span className="ml-1 text-xs text-muted-foreground">(not enough yet)</span>}
            </td>
            <td className="py-2 pr-4">{money(g.medianMicros)}</td>
            <td className="py-2 pr-4">{money(g.p75Micros)}</td>
            <td className="py-2 pr-4">{money(g.maxMicros)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
