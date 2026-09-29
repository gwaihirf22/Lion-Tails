import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { apiRequestAllowingErrors } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CREDENTIAL_RULES } from "@shared/challenge";

/**
 * Where a password-reset link lands.
 *
 * The link in the email is `/reset-password/<token>`; the token is the
 * whole credential, so this page needs no session and is a plain Route.
 * The password rule is the sign-up form's, from shared/challenge.ts -- the
 * server holds the reset to the same one, so a parent is told here rather
 * than by a 400.
 */
const schema = z
  .object({
    password: CREDENTIAL_RULES.password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type Values = z.infer<typeof schema>;

export default function ResetPassword() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = async (values: Values) => {
    setError(null);
    setSaving(true);
    const res = await apiRequestAllowingErrors("POST", "/api/auth/reset-password", {
      token,
      password: values.password,
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) {
      toast({ title: "Password changed", description: "Sign in with your new password." });
      navigate("/auth");
      return;
    }
    const reason: string = body.error ?? body.message ?? "";
    // The server's two token refusals both say "token"; anything else is
    // about the password and is already a sentence.
    setError(
      /token/i.test(reason)
        ? "That link has expired or was already used. Ask for a new one from the sign-in page."
        : reason || "It did not work. Please try again.",
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Choose a new password</CardTitle>
          <CardDescription className="text-center">For your Lion Tails account</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm new password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {error && <p className="m-0 text-sm text-destructive">{error}</p>}

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save new password"
                )}
              </Button>

              <p className="m-0 text-center text-sm text-muted-foreground">
                <Link href="/auth" className="underline">
                  Back to sign in
                </Link>
              </p>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
