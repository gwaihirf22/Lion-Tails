/**
 * Tracks story generation jobs across the whole app.
 *
 * Modelled on use-parent-mode.tsx, the only polling precedent here: a provider
 * with a local `refetchInterval` override, leaving the global TanStack defaults
 * (staleTime: Infinity, refetchInterval: false) untouched.
 *
 * Mounted above the router so a job keeps being watched after navigating away
 * from the generate page -- which is the entire point. Before this, leaving the
 * page abandoned the story.
 */
import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiRequestAllowingErrors } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

export type StoryJob = {
  job_id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  step: string | null;
  created_at: string;
  finished_at: string | null;
  story_id: string | null;
  failure_code: string | null;
  failure_message: string | null;
  model: string;
  target_word_count: number;
  chapters_done: number;
  chapters_total: number;
};

type StoryJobsContextType = {
  jobs: StoryJob[];
  active: StoryJob[];
  /** Changes when a job reaches a terminal state; a cheap dependency to react to. */
  lastCompletedAt: number;
  enqueue: (request: unknown) => Promise<EnqueueOutcome>;
  cancel: (jobId: string) => Promise<void>;
  dismiss: (jobId: string) => void;
  dismissed: string[];
};

export type EnqueueOutcome =
  | { ok: true; jobId: string }
  | { ok: false; status: number; code?: string; message: string; inFlight?: StoryJob[] };

const StoryJobsContext = createContext<StoryJobsContextType | null>(null);

/**
 * 3s while something is running.
 *
 * One indexed query per tick on a single-user LAN app. Polling stops entirely
 * when nothing is in flight -- `refetchInterval` returns false, so an idle app
 * makes no requests at all rather than one every 3 seconds forever.
 */
const POLL_MS = 3000;

export function StoryJobsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [lastCompletedAt, setLastCompletedAt] = useState(0);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const previousTerminal = useRef<Set<string>>(new Set());

  const { data: jobs = [] } = useQuery<StoryJob[]>({
    queryKey: ["/api/story/jobs"],
    queryFn: async () => {
      // Also non-throwing: an unauthenticated poll should yield an empty list
      // rather than an error state the provider has to model.
      const response = await apiRequestAllowingErrors("GET", "/api/story/jobs");
      if (!response.ok) return [];
      return await response.json();
    },
    // Only poll while there is something to watch.
    refetchInterval: (query) => {
      const data = query.state.data as StoryJob[] | undefined;
      const busy = (data ?? []).some((j) => j.status === "queued" || j.status === "running");
      return busy ? POLL_MS : false;
    },
    // Left at the default false on purpose: a hidden tab stops polling, and
    // refetchOnWindowFocus makes coming back instant. Leaving the tab is
    // precisely the case this feature exists for, and the job continues on the
    // server regardless -- there is nothing to keep alive from here.
    refetchOnWindowFocus: true,
    enabled: Boolean(user),
  });

  // Notice transitions into a terminal state, so the library can refresh
  // itself without every consumer diffing the list.
  useEffect(() => {
    let changed = false;
    for (const job of jobs) {
      const terminal = job.status === "succeeded" || job.status === "failed" || job.status === "cancelled";
      if (terminal && !previousTerminal.current.has(job.job_id)) {
        previousTerminal.current.add(job.job_id);
        changed = true;
      }
    }
    if (changed) {
      setLastCompletedAt(Date.now());
      // The worker saved the story, so the library is stale.
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
    }
  }, [jobs, queryClient]);

  const enqueue = async (request: unknown): Promise<EnqueueOutcome> => {
    // apiRequestAllowingErrors, not apiRequest: apiRequest THROWS on non-2xx,
    // which would discard the 409 body -- and the in-flight job it carries is
    // the entire reason the server answers 409 rather than a bare error.
    const response = await apiRequestAllowingErrors("POST", "/api/story/generate", request);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return {
        ok: false,
        status: response.status,
        code: body.code,
        message: body.message || "Could not start the story.",
        inFlight: body.inFlight,
      };
    }
    const body = await response.json();
    await queryClient.invalidateQueries({ queryKey: ["/api/story/jobs"] });
    return { ok: true, jobId: body.jobId };
  };

  const cancel = async (jobId: string) => {
    await apiRequest("POST", `/api/story/jobs/${jobId}/cancel`);
    await queryClient.invalidateQueries({ queryKey: ["/api/story/jobs"] });
  };

  const dismiss = (jobId: string) => setDismissed((d) => [...d, jobId]);

  const active = jobs.filter((j) => j.status === "queued" || j.status === "running");

  return (
    <StoryJobsContext.Provider
      value={{ jobs, active, lastCompletedAt, enqueue, cancel, dismiss, dismissed }}
    >
      {children}
    </StoryJobsContext.Provider>
  );
}

export function useStoryJobs(): StoryJobsContextType {
  const ctx = useContext(StoryJobsContext);
  if (!ctx) {
    throw new Error("useStoryJobs must be used within a StoryJobsProvider");
  }
  return ctx;
}

/** Human-readable progress for a job, used by the header badge and the form. */
export function describeJob(job: StoryJob): string {
  if (job.status === "queued") return "Waiting to start…";
  if (job.status === "running") {
    if (job.chapters_total > 0 && job.chapters_done > 0) {
      return `Writing part ${Math.min(job.chapters_done + 1, job.chapters_total)} of ${job.chapters_total}…`;
    }
    if (job.step === "outline") return "Planning the story…";
    if (job.step === "writing") return "Writing the story…";
    return "Starting…";
  }
  if (job.status === "succeeded") return "Finished";
  if (job.status === "cancelled") return "Cancelled";
  return job.failure_message || "Failed";
}
