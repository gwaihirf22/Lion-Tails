import { createContext, ReactNode, useContext, useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type ParentModeContextType = {
  isActive: boolean;
  isLoading: boolean;
  expiresAt: number | null;
  verifyPassword: (password: string) => Promise<boolean>;
  disable: () => void;
  checkStatus: () => void;
};

export const ParentModeContext = createContext<ParentModeContextType | null>(null);

export function ParentModeProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [isActive, setIsActive] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);

  // Check parent mode status on mount and periodically
  const { data: statusData, isLoading } = useQuery({
    queryKey: ["/api/auth/parent-mode-status"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/auth/parent-mode-status");
      if (!response.ok) throw new Error("Failed to check parent mode status");
      return await response.json();
    },
    refetchInterval: 5 * 60 * 1000, // Check every 5 minutes
    refetchOnWindowFocus: true,
  });

  // Update state when status data changes
  useEffect(() => {
    if (statusData) {
      setIsActive(statusData.isActive);
      setExpiresAt(statusData.expiresAt);
    }
  }, [statusData]);

  // Password verification mutation
  const verifyPasswordMutation = useMutation({
    mutationFn: async (password: string) => {
      const response = await apiRequest("POST", "/api/auth/verify-password", { password });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Password verification failed");
      }
      return await response.json();
    },
    onSuccess: (data) => {
      setIsActive(true);
      setExpiresAt(data.expiresAt);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/parent-mode-status"] });
      toast({
        title: "Parent Mode Activated",
        description: "You can now edit AI prompts for 30 minutes.",
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

  const verifyPassword = async (password: string): Promise<boolean> => {
    try {
      await verifyPasswordMutation.mutateAsync(password);
      return true;
    } catch {
      return false;
    }
  };

  const disable = () => {
    setIsActive(false);
    setExpiresAt(null);
    toast({
      title: "Parent Mode Disabled",
      description: "Prompt editing has been disabled.",
    });
  };

  const checkStatus = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/auth/parent-mode-status"] });
  };

  // Auto-disable when expired
  useEffect(() => {
    if (expiresAt && Date.now() > expiresAt) {
      setIsActive(false);
      setExpiresAt(null);
    }
  }, [expiresAt]);

  return (
    <ParentModeContext.Provider
      value={{
        isActive,
        isLoading,
        expiresAt,
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