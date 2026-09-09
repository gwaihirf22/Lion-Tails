/**
 * Universes, for the library and the generate form.
 *
 * `isStale` and `canMakeSummary` are computed on the SERVER and only rendered
 * here. Recomputing them client-side would be a second definition of "current",
 * which is how this codebase produced six model lists and four schema sources.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiRequestAllowingErrors } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

export type CanonItem = {
  id: string;
  text: string;
  sourceStoryId?: string;
  createdAt: string;
  status: "active" | "proposed";
};

export type Universe = {
  universeId: string;
  name: string;
  createdAt: string;
  storyCount: number;
  summary: string | null;
  summaryUpdatedAt: string | null;
  summaryEditedAt: string | null;
  summaryModel: string | null;
  summaryCoveredCount: number | null;
  summaryDroppedCount: number | null;
  pinnedCanon: CanonItem[];
  /** What the stories established, refreshed by each one. See server/lib/worldState.ts. */
  worldState: Array<{ id: string; kind: "character" | "fact" | "thread"; text: string; status: "current" | "closed" }>;
  isStale: boolean;
  canMakeSummary: boolean;
  activeSummaryJobId: string | null;
};

export type SummaryOutcome =
  | { ok: true; jobId: string; coveredCount: number; droppedCount: number }
  | { ok: false; status: number; code?: string; message: string };

export function useUniverses() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: universes = [], isLoading } = useQuery<Universe[]>({
    queryKey: ["/api/universes"],
    queryFn: async () => {
      const r = await apiRequestAllowingErrors("GET", "/api/universes");
      return r.ok ? await r.json() : [];
    },
    enabled: Boolean(user),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/universes"] });

  const create = async (name: string): Promise<Universe | { error: string }> => {
    // Non-throwing: a duplicate name is a normal answer the caller shows, not
    // an exception. apiRequest would throw and lose the message.
    const r = await apiRequestAllowingErrors("POST", "/api/universes", { name });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { error: body.message || "Could not create that universe." };
    await refresh();
    return body;
  };

  const rename = async (universeId: string, name: string) => {
    await apiRequest("PATCH", `/api/universes/${universeId}`, { name });
    await refresh();
  };

  /** Stories survive: they return to Unassigned rather than being deleted. */
  const remove = async (universeId: string) => {
    await apiRequest("DELETE", `/api/universes/${universeId}`);
    await refresh();
    await queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
  };

  const moveStory = async (storyId: string, universeId: string | null) => {
    await apiRequest("PUT", `/api/stories/${storyId}/universe`, { universeId });
    await refresh();
    await queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
  };

  const makeSummary = async (universeId: string, force = false): Promise<SummaryOutcome> => {
    const r = await apiRequestAllowingErrors("POST", `/api/universes/${universeId}/summary`, { force });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, status: r.status, code: body.code, message: body.message || "Could not start the summary." };
    }
    await refresh();
    await queryClient.invalidateQueries({ queryKey: ["/api/story/jobs"] });
    return { ok: true, jobId: body.jobId, coveredCount: body.coveredCount, droppedCount: body.droppedCount };
  };

  const editSummary = async (universeId: string, summary: string): Promise<{ ok: boolean; message?: string }> => {
    const r = await apiRequestAllowingErrors("PUT", `/api/universes/${universeId}/summary`, { summary });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      return { ok: false, message: body.message || "Could not save." };
    }
    await refresh();
    return { ok: true };
  };

  const addCanon = async (universeId: string, text: string): Promise<{ ok: boolean; message?: string }> => {
    const r = await apiRequestAllowingErrors("POST", `/api/universes/${universeId}/canon`, { text });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      return { ok: false, message: body.message || "Could not pin that." };
    }
    await refresh();
    return { ok: true };
  };

  const removeCanon = async (universeId: string, canonId: string) => {
    await apiRequestAllowingErrors("DELETE", `/api/universes/${universeId}/canon/${canonId}`);
    await refresh();
  };

  return {
    universes,
    isLoading,
    refresh,
    create,
    rename,
    remove,
    moveStory,
    makeSummary,
    editSummary,
    addCanon,
    removeCanon,
  };
}
