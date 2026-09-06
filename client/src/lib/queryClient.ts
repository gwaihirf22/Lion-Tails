import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Parse first, throw after. Previously the throw sat inside the try, so its
    // own catch swallowed it and every error surfaced as "<status>: <raw json>"
    // -- the server's message was parsed and then discarded.
    let message: string | undefined;
    try {
      const errorData = await res.clone().json();
      message = errorData.error || errorData.message;
    } catch {
      const text = await res.clone().text().catch(() => "");
      message = text || undefined;
    }
    throw new Error(message || `${res.status}: ${res.statusText}`);
  }
}

// Get auth token from localStorage
function getAuthToken(): string | null {
  return localStorage.getItem("authToken");
}

/**
 * Fetch wrapper that THROWS on any non-2xx response.
 *
 * It returns a Response, so it looks like `fetch` -- and every `fetch` idiom
 * you would reflexively write against it is wrong. In particular
 * `if (!response.ok)` after this call is DEAD CODE: the throw already happened.
 * That mistake has been made repeatedly here (Settings.handleModelChange showed
 * "please try again" instead of the server reason for exactly this reason).
 *
 * When the STATUS is meaningful -- a 409 carrying the conflicting record, a 404
 * you want to handle rather than surface -- use apiRequestAllowingErrors below,
 * which returns the Response untouched.
 */
async function sendRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};

  // Add content-type for JSON requests
  if (data) {
    headers["Content-Type"] = "application/json";
  }

  // Add auth token if available
  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include", // Include cookies
  });
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await sendRequest(method, url, data);
  await throwIfResNotOk(res);
  return res;
}

/**
 * Same request, but the caller inspects the status itself.
 *
 * For endpoints where a non-2xx carries information the caller needs: the
 * enqueue route answers 409 with the in-flight job so the UI can point at it
 * rather than showing a dead end, and that body is lost if the response throws.
 */
export async function apiRequestAllowingErrors(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  return sendRequest(method, url, data);
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const headers: Record<string, string> = {};
    
    // Add auth token if available
    const token = getAuthToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    
    const res = await fetch(queryKey[0] as string, {
      headers,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    try {
      // Clone the response before checking and reading
      const resForCheck = res.clone();
      await throwIfResNotOk(resForCheck);
      
      // Use another clone for reading the body
      const resForReading = res.clone();
      return await resForReading.json();
    } catch (error) {
      console.error("Error in queryFn:", error);
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
