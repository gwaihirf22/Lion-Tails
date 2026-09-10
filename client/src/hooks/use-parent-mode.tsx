import { createContext, ReactNode, useContext, useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * Parent Mode, as the SERVER says it is.
 *
 * `isActive` comes from the status route, which uses the same predicate the
 * guards use. The client no longer decides anything from `expiresAt` except
 * the minutes countdown, and only when the mode is not indefinite -- "until
 * I turn it off" is not an expiry, and a client-side expiry check would have
 * disagreed with the server about it.
 *
 * `disable()` used to clear React state and send nothing; the session stayed
 * valid and the next poll turned it back on. It calls the off route now.
 */
type ParentModeContextType = {
  isActive: boolean;
  isLoading: boolean;
  expiresAt: number | null;
  /** On until turned off or signed out, rather than for the window. */
  indefinite: boolean;
  verifyPassword: (password: string, keep?: boolean) => Promise<boolean>;
  disable: () => void;
  checkStatus: () => void;
};

type Status = { isActive: boolean; expiresAt: number | null; indefinite: boolean };

export const ParentModeContext = createContext<ParentModeContextType | null>(null);

export function ParentModeProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [isActive, setIsActive] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [indefinite, setIndefinite] = useState(false);

  const { data: statusData, isLoading } = useQuery<Status>({
    queryKey: ["/api/auth/parent-mode-status"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/auth/parent-mode-status");
      if (!response.ok) throw new Error("Failed to check parent mode status");
      return await response.json();
    },
    refetchInterval: 5 * 60 * 1000, // Check every 5 minutes
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (statusData) {
      setIsActive(statusData.isActive);
      setExpiresAt(statusData.expiresAt);
      setIndefinite(Boolean(statusData.indefinite));
    }
  }, [statusData]);

  const verifyPasswordMutation = useMutation({
    mutationFn: async ({ password, keep }: { password: string; keep: boolean }) => {
      const response = await apiRequest("POST", "/api/auth/verify-password", { password, keep });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Password verification failed");
      }
      return (await response.json()) as { expiresAt: number | null; indefinite: boolean };
    },
    onSuccess: (data) => {
      setIsActive(true);
      setExpiresAt(data.expiresAt);
      setIndefinite(Boolean(data.indefinite));
      queryClient.invalidateQueries({ queryKey: ["/api/auth/parent-mode-status"] });
      toast({
        title: "Parent Mode on",
        description: data.indefinite
          ? "Until you turn it off or sign out."
          : "For 30 minutes, or until you turn it off.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Authentication Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const verifyPassword = async (password: string, keep = false): Promise<boolean> => {
    try {
      await verifyPasswordMutation.mutateAsync({ password, keep });
      return true;
    } catch {
      return false;
    }
  };

  const disableMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/parent-mode-off");
    },
    onSuccess: () => {
      setIsActive(false);
      setExpiresAt(null);
      setIndefinite(false);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/parent-mode-status"] });
      toast({ title: "Parent Mode off" });
    },
    onError: () => {
      toast({
        title: "Could not turn Parent Mode off",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const disable = () => {
    disableMutation.mutate();
  };

  const checkStatus = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/auth/parent-mode-status"] });
  };

  // The window ran out between polls. Guarded on !indefinite: with no expiry
  // there is nothing to run out.
  useEffect(() => {
    if (!indefinite && expiresAt && Date.now() > expiresAt) {
      setIsActive(false);
      setExpiresAt(null);
    }
  }, [expiresAt, indefinite]);

  return (
    <ParentModeContext.Provider
      value={{
        isActive,
        isLoading,
        expiresAt,
        indefinite,
        verifyPassword,
        disable,
        checkStatus,
      }}
    >
      {children}
    </ParentModeContext.Provider>
  );
}

export function useParentMode() {
  const context = useContext(ParentModeContext);
  if (!context) {
    throw new Error("useParentMode must be used within a ParentModeProvider");
  }
  return context;
}
