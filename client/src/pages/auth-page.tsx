import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2 } from "lucide-react";
import lantern from "@/assets/lantern.webp";
import { useQuery } from "@tanstack/react-query";
import TurnstileGate from "@/components/TurnstileGate";
import {
  answersChallenge,
  CHALLENGE_HINT,
  CHALLENGE_QUESTION,
  CHALLENGE_WRONG,
  CREDENTIAL_RULES,
} from "@shared/challenge";

// Extend the schemas from shared/schema.ts
const loginSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

/**
 * THE RULES COME FROM shared/challenge.ts, and the answer is no longer checked
 * here alone.
 *
 * What was here before: the challenge answer was compared in the browser and
 * then DELETED from the payload, so the server never saw it, and the only
 * password/email rules in the app were these — the API accepted a
 * one-character password. Both halves are fixed: the same rules run on the
 * server, and the answer and the Turnstile token are sent to be checked there.
 */
const registerSchema = z.object({
  ...CREDENTIAL_RULES,
  confirmPassword: z.string(),
  challenge: z.string().refine(answersChallenge, { message: CHALLENGE_WRONG }),
  // Filled by the widget, required before the button works. Empty is the
  // widget saying "no usable token" — including after one expires.
  turnstileToken: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  // ?tab=register opens straight onto sign-up -- the shared-story page's
  // "Make your own story" sends people here, and landing them on Log In
  // asks a newcomer for an account they do not have.
  const [activeTab, setActiveTab] = useState<string>(() =>
    new URLSearchParams(window.location.search).get("tab") === "register" ? "register" : "login",
  );

  // Create forms
  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      challenge: "",
      turnstileToken: "",
    },
  });

  /**
   * Whether this server demands a challenge, and the public site key.
   *
   * Asked rather than built in, so the same image serves production and a dev
   * box with Cloudflare's test keys — and so a key can be rotated without
   * shipping a client. `required` false is a development server with no secret
   * configured: the widget is not drawn and the server does not ask for a
   * token, which is what keeps dev-seed and the screenshot script working.
   */
  const { data: challenge, isLoading: challengeLoading } = useQuery<{
    required: boolean;
    siteKey: string | null;
    question: string;
    hint: string;
  }>({ queryKey: ["/api/auth/challenge"], staleTime: Infinity });
  const needsWidget = Boolean(challenge?.required && challenge.siteKey);

  // Handle form submissions
  const onLoginSubmit = (values: LoginFormValues) => {
    loginMutation.mutate(values);
  };

  const onRegisterSubmit = (values: RegisterFormValues) => {
    // confirmPassword is the only field the API has no use for. The challenge
    // answer and the token GO — deleting them here is precisely what made the
    // old challenge decoration, and the server checks both.
    const { confirmPassword, ...registerData } = values;
    registerMutation.mutate(registerData);
  };

  // Redirect if already logged in
  if (user) {
    return <Redirect to="/" />;
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      {/* Auth form section */}
      <div className="w-full md:w-1/2 p-6 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Lion Tails</CardTitle>
            <CardDescription className="text-center">
              Biblical stories for children of God
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Log In</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>

              {/* Login Form */}
              <TabsContent value="login">
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4 pt-4">
                    <FormField
                      control={loginForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input placeholder="yourusername" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={loginMutation.isPending}
                    >
                      {loginMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Logging in...
                        </>
                      ) : (
                        "Log In"
                      )}
                    </Button>
                  </form>
                </Form>
              </TabsContent>

              {/* Register Form */}
              <TabsContent value="register">
                <Form {...registerForm}>
                  <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4 pt-4">
                    <FormField
                      control={registerForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input placeholder="yourusername" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input placeholder="you@example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {/* Challenge Question */}
                    <FormField
                      control={registerForm.control}
                      name="challenge"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Challenge Question</FormLabel>
                          <FormDescription className="text-sm">
                            {challenge?.question ?? CHALLENGE_QUESTION} ({challenge?.hint ?? CHALLENGE_HINT})
                          </FormDescription>
                          <FormControl>
                            <Input placeholder="Enter your answer" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* The real check. Drawn only where the server demands one,
                        so a dev box with no secret behaves as it always did. */}
                    {needsWidget && challenge?.siteKey && (
                      <FormField
                        control={registerForm.control}
                        name="turnstileToken"
                        render={() => (
                          <FormItem>
                            <FormControl>
                              <TurnstileGate
                                siteKey={challenge.siteKey!}
                                action="register"
                                onToken={(token) =>
                                  registerForm.setValue("turnstileToken", token, {
                                    shouldValidate: true,
                                  })
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <Button
                      type="submit"
                      className="w-full"
                      // Waits for the token as well as the request: pressing
                      // it without one would only earn a refusal from the
                      // server, which reads as the form being broken.
                      disabled={
                        registerMutation.isPending ||
                        challengeLoading ||
                        (needsWidget && !registerForm.watch("turnstileToken"))
                      }
                    >
                      {registerMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating Account...
                        </>
                      ) : (
                        "Create Account"
                      )}
                    </Button>
                  </form>
                </Form>
              </TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter className="flex justify-center">
            <p className="text-sm text-muted-foreground">
              {activeTab === "login" ? (
                "Don't have an account? "
              ) : (
                "Already have an account? "
              )}
              <Button 
                variant="link" 
                className="p-0" 
                onClick={() => setActiveTab(activeTab === "login" ? "register" : "login")}
              >
                {activeTab === "login" ? "Register" : "Log In"}
              </Button>
            </p>
          </CardFooter>
        </Card>
      </div>

      {/* Hero section */}
      <div className="w-full md:w-1/2 bg-primary/10 p-6 flex flex-col items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          {/*
            The lantern, not the cover.

            This column is the emptiest screen in the app and the one where a
            first-time visitor decides whether to sign up, so it wants the
            artwork. But the cover has text baked into it, and text over a busy
            image needs a colour chosen against that image -- which
            decisions.md §23 is explicit about: a hardcoded colour is a guess
            about the background, and this app has four palettes. The lantern
            arrived on transparency, so it sits on whatever the palette
            provides and cannot guess wrong.

            It also matches the copy directly below it, which now promises "a
            lantern that opens onto the stories that must not be forgotten".
          */}
          <img
            src={lantern}
            alt=""
            aria-hidden="true"
            className="w-28 h-28 mx-auto mb-4 drop-shadow-lg motion-safe:animate-float"
            loading="lazy"
          />
          <h1 className="text-3xl font-bold tracking-tight mb-4">Welcome to Lion Tails</h1>
          <p className="mb-6">
            Create personalized Biblical stories that teach faith and Christian values,
            then shape them however you like. Stories that engage, inspire, and instill a love for God's Word.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card rounded-lg p-4 shadow-sm">
              <h3 className="font-semibold">Faith-Based Stories</h3>
              <p className="text-sm">Biblical adventures, with the characters you choose</p>
            </div>
            <div className="bg-card rounded-lg p-4 shadow-sm">
              <h3 className="font-semibold">Christian Songs</h3>
              <p className="text-sm">Learn and sing songs with guitar chords</p>
            </div>
            <div className="bg-card rounded-lg p-4 shadow-sm">
              <h3 className="font-semibold">Bible Characters</h3>
              <p className="text-sm">Explore stories about heroes of the faith</p>
            </div>
            <div className="bg-card rounded-lg p-4 shadow-sm">
              <h3 className="font-semibold">Quests with the Timekeeper</h3>
              <p className="text-sm">Your character, and a lantern that opens onto the stories that must not be forgotten</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}