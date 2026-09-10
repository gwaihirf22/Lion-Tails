import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SavedStory } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

/**
 * The library, as a query.
 *
 * It was a raw useEffect into useState on one page, which meant two things
 * that already invalidate ["/api/stories"] -- use-universes' moveStory and
 * remove, and the job provider when a story finishes -- were talking to
 * nobody. A query is what those invalidations were written for. The hook
 * carries no job awareness of its own: use-story-jobs.tsx already
 * invalidates on completion, and a second mechanism for the same fact is
 * how this codebase grew six model lists.
 *
 * Built-ins (the prologue) are split out here, once, so every page that lists
 * stories agrees on what is the user's and what the app ships with.
 */
export function useStories() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery<SavedStory[]>({
    queryKey: ["/api/stories"],
    enabled: Boolean(user),
  });

  const { builtIn, stories } = useMemo(() => {
    const all = query.data ?? [];
    return {
      builtIn: all.filter((s) => s.builtIn),
      stories: all.filter((s) => !s.builtIn),
    };
  }, [query.data]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/stories"] });

  const toggleFavorite = useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      const r = await apiRequest("PUT", `/api/stories/${id}/favorite`, { isFavorite });
      return (await r.json()) as SavedStory;
    },
    onSuccess: (saved) => {
      invalidate();
      toast({
        title: saved.isFavorite ? "Added to favorites" : "Removed from favorites",
        description: saved.isFavorite
          ? "This story is kept for good."
          : "This story is kept for a year.",
      });
    },
    onError: (error) =>
      toast({
        title: "Could not update",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      }),
  });

  const deleteStory = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/stories/${id}`);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Story deleted" });
    },
    onError: (error) =>
      toast({
        title: "Could not delete",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      }),
  });

  return {
    builtIn,
    stories,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    toggleFavorite,
    deleteStory,
  };
}
