import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";

interface ProtectedRouteProps {
  path: string;
  component: React.ComponentType;
  requireVerified?: boolean;
}

export function ProtectedRoute({
  path,
  component: Component,
  requireVerified = false,
}: ProtectedRouteProps) {
  const { user, isLoading, isAuthenticated } = useAuth();

  // Show loading spinner while checking auth status
  if (isLoading) {
    return (
      <Route path={path}>
        {() => (
          <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
      </Route>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return (
      <Route path={path}>
        {() => <Redirect to="/auth" />}
      </Route>
    );
  }

  // If we require verified email and the user is not verified, show verification required page
  if (requireVerified && user && !user.isVerified) {
    return (
      <Route path={path}>
        {() => (
          <div className="container mx-auto py-12 px-4 text-center">
            <h1 className="text-3xl font-bold mb-6">Email Verification Required</h1>
            <p className="mb-4">
              Please verify your email address before accessing this page. Check your email for a verification link.
            </p>
            <p className="mb-6 text-sm text-muted-foreground">
              If you haven't received the email, check your spam folder or contact support.
            </p>
          </div>
        )}
      </Route>
    );
  }

  // If all checks pass, render the component
  return <Route path={path}>{() => <Component />}</Route>;
}