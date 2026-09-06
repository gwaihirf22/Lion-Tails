/**
 * Admin view over generation_records.
 *
 * Tables rather than charts, deliberately. With a handful of generations a
 * chart implies a trend that is not there, and the numbers that matter here --
 * delivered vs requested words, median tokens per step -- are read, not
 * eyeballed. It also avoids a charting dependency for a page one person uses.
 *
 * Small-sample honesty is built in: any row with fewer than MIN_MEANINGFUL
 * attempts is marked, because a 100% success rate over two generations is not
 * a success rate.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { apiRequestAllowingErrors } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

const MIN_MEANINGFUL = 10;

type ModelStats = {
  model: string;
  provider: string;
  tier: string;
  attempts: number;
  succeeded: number;
  failed: number;
  successRate: number;
  medianDurationMs: number | null;
  avgTotalTokens: number | null;
  avgWordRatio: number | null;
  retriedCalls: number;
  truncatedCalls: number;
};
type FailureStats = { failureCode: string; n: number; models: string[] };
type StepCost = {
  step: string;
  model: string;
  calls: number;
  medianCompletionTokens: number | null;
  truncated: number;
};
type RecentGeneration = {
  generationId: string;
  createdAt: string;
  model: string;
  storyLength: string | null;
  outcome: string;
  failureCode: string | null;
  durationMs: number | null;
  totalTokens: number | null;
  actualWordCount: number | null;
  targetWordCount: number | null;
  chapterWordCounts: number[] | null;
  appVersion: string | null;
};
type JobHealth = { status: string; n: number; resumed: number };

type Stats = {
  windowDays: number;
  models: ModelStats[];
  failures: FailureStats[];
  steps: StepCost[];
  recent: RecentGeneration[];
  jobs: JobHealth[];
};

const secs = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)}s`);
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const num = (n: number | null) => (n === null ? "—" : Math.round(n).toLocaleString());

export default function AdminStats() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      // Non-throwing: a 403 here is a normal answer for a non-admin, and we
      // want to say so rather than surface an exception.
      const response = await apiRequestAllowingErrors(
        "GET",
        `/api/admin/generation-stats?days=${days}`,
      );
      if (cancelled) return;
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message || "Could not load stats");
        setLoading(false);
        return;
      }
      setStats(await response.json());
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="max-w-2xl mx-auto bg-white/90">
        <CardContent className="p-8 text-center">
          <h2 className="text-xl font-medium mb-2">Stats unavailable</h2>
          <p className="text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  const totalAttempts = stats.models.reduce((a, m) => a + m.attempts, 0);
  const resumedJobs = stats.jobs.reduce((a, j) => a + j.resumed, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-3xl font-heading font-bold text-secondary">Generation Stats</h2>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? "default" : "outline"}
              onClick={() => setDays(d)}
            >
              {d}d
            </Button>
          ))}
        </div>
      </div>

      {totalAttempts === 0 && (
        <Card className="bg-white/90">
          <CardContent className="p-6 text-muted-foreground">
            No generations recorded in the last {stats.windowDays} days. Records start
            from the deploy that added this table — anything generated before then
            has no row here.
          </CardContent>
        </Card>
      )}

      {totalAttempts > 0 && totalAttempts < MIN_MEANINGFUL && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4 text-sm text-amber-900">
            Only {totalAttempts} generation{totalAttempts === 1 ? "" : "s"} in this
            window. These models vary enormously run to run — the same request has
            measured 57%, 81% and 82% of its target length — so treat everything
            below as anecdote until there are more.
          </CardContent>
        </Card>
      )}

      {stats.models.length > 0 && (
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="text-lg">By model</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-4">Model</th>
                  <th className="py-2 pr-4">Tier</th>
                  <th className="py-2 pr-4">Runs</th>
                  <th className="py-2 pr-4">Success</th>
                  <th className="py-2 pr-4">Median time</th>
                  <th className="py-2 pr-4">Avg tokens</th>
                  <th className="py-2 pr-4" title="Delivered words as a share of what was requested">
                    Length vs asked
                  </th>
                  <th className="py-2 pr-4">Retries</th>
                </tr>
              </thead>
              <tbody>
                {stats.models.map((m) => (
                  <tr key={`${m.model}-${m.tier}`} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{m.model}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{m.tier}</td>
                    <td className="py-2 pr-4">
                      {m.attempts}
                      {m.attempts < MIN_MEANINGFUL && (
                        <span className="text-amber-600 ml-1" title="Too few runs to be meaningful">
                          *
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{pct(m.successRate)}</td>
                    <td className="py-2 pr-4">{secs(m.medianDurationMs)}</td>
                    <td className="py-2 pr-4">{num(m.avgTotalTokens)}</td>
                    <td
                      className={
                        m.avgWordRatio !== null && (m.avgWordRatio < 0.8 || m.avgWordRatio > 1.3)
                          ? "py-2 pr-4 text-amber-700 font-medium"
                          : "py-2 pr-4"
                      }
                    >
                      {pct(m.avgWordRatio)}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {m.retriedCalls} / {m.truncatedCalls} trunc
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {stats.steps.length > 0 && (
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="text-lg">Cost per step</CardTitle>
            <p className="text-sm text-muted-foreground">
              Median completion tokens per call. Planning and prose are different
              jobs — if one step dominates on a model, that step may want a
              different model.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-4">Step</th>
                  <th className="py-2 pr-4">Model</th>
                  <th className="py-2 pr-4">Calls</th>
                  <th className="py-2 pr-4">Median tokens</th>
                  <th className="py-2 pr-4">Truncated</th>
                </tr>
              </thead>
              <tbody>
                {stats.steps.map((s) => (
                  <tr key={`${s.step}-${s.model}`} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{s.step}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{s.model}</td>
                    <td className="py-2 pr-4">{s.calls}</td>
                    <td className="py-2 pr-4">{num(s.medianCompletionTokens)}</td>
                    <td className="py-2 pr-4">{s.truncated || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {stats.failures.length > 0 && (
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="text-lg">Failures</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                {stats.failures.map((f) => (
                  <tr key={f.failureCode} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs">{f.failureCode}</td>
                    <td className="py-2 pr-4">{f.n}</td>
                    <td className="py-2 text-muted-foreground">{f.models.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {stats.jobs.length > 0 && (
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="text-lg">Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                {stats.jobs.map((j) => (
                  <tr key={j.status} className="border-b last:border-0">
                    <td className="py-2 pr-4">{j.status}</td>
                    <td className="py-2 pr-4">{j.n}</td>
                    <td className="py-2 text-muted-foreground">
                      {j.resumed > 0 ? `${j.resumed} resumed after an interruption` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {resumedJobs > 0 && (
              <p className="text-xs text-muted-foreground mt-3">
                A resumed job's earlier attempts wrote no record — the process
                stopped before the write — so token totals above understate those
                runs specifically. The gap is biased toward interrupted work, not
                spread evenly.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {stats.recent.length > 0 && (
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="text-lg">Recent generations</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">Model</th>
                  <th className="py-2 pr-4">Length</th>
                  <th className="py-2 pr-4">Outcome</th>
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2 pr-4">Words</th>
                  <th className="py-2 pr-4">Per chapter</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((r) => (
                  <tr key={r.generationId} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">{r.model}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.storyLength ?? "—"}</td>
                    <td className="py-2 pr-4">
                      {r.outcome === "succeeded" ? (
                        <span className="text-green-700">ok</span>
                      ) : (
                        <span className="text-destructive font-mono text-xs">
                          {r.failureCode ?? "failed"}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{secs(r.durationMs)}</td>
                    <td className="py-2 pr-4">
                      {r.actualWordCount === null
                        ? "—"
                        : `${r.actualWordCount} / ${r.targetWordCount ?? "?"}`}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground font-mono text-xs">
                      {r.chapterWordCounts?.length ? r.chapterWordCounts.join(", ") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
