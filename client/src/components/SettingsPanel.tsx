/**
 * Settings, as a COMPONENT rather than a page.
 *
 * The header opens it in a dialog over whatever you were doing, so changing a
 * model or a text size no longer costs you your place. /settings still exists
 * and renders this same component full-page, because the Home page links there
 * and people bookmark URLs.
 *
 * One copy, two presentations -- not two copies that drift.
 */
import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { type StoryUsage } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import ReadingSettingsCard from "@/components/reader/ReadingSettingsCard";
import ParentModeToggle from "@/components/ParentModeToggle";
import ResetSheetCard from "@/components/ResetSheetCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

/**
 * Served by GET /api/settings/models, which derives this from MODEL_CATALOG in
 * server/lib/modelPolicy.ts. Do NOT reintroduce a hardcoded list here: this
 * page previously offered six models, four of which the server rejects with a
 * 403, and omitted the free local tier entirely. See docs/decisions.md §11.
 */
interface SelectableModel {
  id: string;
  label: string;
  tier: "local" | "economy" | "premium";
  warning?: string;
  allowed: boolean;
}

const TIER_ORDER: SelectableModel["tier"][] = ["local", "economy", "premium"];

const TIER_LABELS: Record<SelectableModel["tier"], string> = {
  local: "Free — runs on this server",
  economy: "Standard",
  premium: "Premium",
};

export function SettingsPanel() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");
  // Deliberately empty: the current selection comes from the server. Seeding a
  // model id here would be a hardcoded model name in the client again, and the
  // default belongs to MODEL_CATALOG, not to this page.
  const [selectedModel, setSelectedModel] = useState("");
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  /**
   * The SAME query the Create Story pill uses, by key.
   *
   * This was a bare useEffect fetch against a second endpoint with no query
   * key, so it never revalidated -- generate a story and this card kept the
   * old number until a full reload. That second endpoint also disagreed with
   * the first by construction: it called the total 60 when a reset date
   * existed, while the other called it 60 when one did not.
   */
  const { data: storyStats, isLoading: isLoadingStats } = useQuery<StoryUsage>({
    queryKey: ["/api/story/usage"],
  });
  const [models, setModels] = useState<SelectableModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // Quality caveat for the currently selected model, e.g. the local tier.
  const selectedModelWarning = models.find((m) => m.id === selectedModel)?.warning;

  // Which models this user may select depends on whether they hold their own
  // API key, so this is refetched whenever that changes rather than only on
  // mount.
  const loadModels = async () => {
    setIsLoadingModels(true);
    try {
      const response = await apiRequest("GET", "/api/settings/models");
      if (response.ok) {
        const data = await response.json();
        setModels(data.models ?? []);
      }
    } catch (error) {
      console.error("Error loading available models:", error);
    } finally {
      setIsLoadingModels(false);
    }
  };

  // Fetch initial data
  useEffect(() => {
    async function fetchData() {
      try {
        // Check if user has stored an API key
        const keyResponse = await apiRequest("GET", "/api/settings/openai-key-status");
        const keyData = await keyResponse.json();
        setHasStoredKey(keyData.hasKey);

        // Get current model selection
        const modelResponse = await apiRequest("GET", "/api/settings/openai-model");
        const modelData = await modelResponse.json();
        setSelectedModel(modelData.model);

        await loadModels();

      } catch (error) {
        console.error("Error fetching settings:", error);
        toast({
          title: "Error",
          description: "Failed to load settings. Please try again.",
          variant: "destructive",
        });
      }
    }

    fetchData();
  }, [toast]);

  // Handle API key submission
  const handleSubmitApiKey = async () => {
    if (!apiKey) {
      toast({
        title: "API Key Required",
        description: "Please enter your OpenAI API key.",
        variant: "destructive",
      });
      return;
    }

    if (!apiKey.startsWith("sk-")) {
      toast({
        title: "Invalid API Key",
        description: "OpenAI API keys typically start with 'sk-'.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await apiRequest("POST", "/api/settings/openai-key", { key: apiKey });
      
      if (response.ok) {
        setHasStoredKey(true);
        // Adding a key unlocks the premium tier.
        await loadModels();
        setApiKey(""); // Clear the input for security
        toast({
          title: "API Key Saved",
          description: "Your OpenAI API key has been saved successfully.",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to save API key. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error saving API key:", error);
      toast({
        title: "Error",
        description: "Failed to save API key. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle API key deletion
  const handleDeleteApiKey = async () => {
    setIsDeleting(true);

    try {
      const response = await apiRequest("DELETE", "/api/settings/openai-key");
      
      if (response.ok) {
        setHasStoredKey(false);
        // Removing a key revokes the premium tier; the server will downgrade a
        // stored premium selection at generation time regardless.
        await loadModels();
        toast({
          title: "API Key Removed",
          description: "Your OpenAI API key has been removed.",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to remove API key. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error deleting API key:", error);
      toast({
        title: "Error",
        description: "Failed to remove API key. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle model selection
  const handleModelChange = async (value: string) => {
    const previous = selectedModel;
    setSelectedModel(value);

    try {
      // apiRequest throws on a non-2xx response, so there is no falsy branch to
      // handle here.
      await apiRequest("POST", "/api/settings/openai-model", { model: value });

      const chosen = models.find((m) => m.id === value);
      toast({
        title: "Model updated",
        description: chosen ? `Stories will now use ${chosen.label}.` : `Model set to ${value}.`,
      });
    } catch (error) {
      // The server rejects a model the account is not entitled to. Put the
      // selection back rather than leaving the dropdown showing a value that
      // was not saved.
      setSelectedModel(previous);
      console.error("Error updating model:", error);
      toast({
        title: "Could not change model",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update model selection. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Format the date nicely
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  return (
    <div className="grid gap-8 md:grid-cols-2">
        {/* Reading preferences. Same provider and same picker as the reader's
            own bar -- no duplicated state, no second list of palettes. */}
        <ReadingSettingsCard />

        {/* Parent Mode. It used to sit on the Create Story page, where it was a
            large warning-coloured card above the form that everyone saw every
            time whether or not they had any use for it. It is an account
            setting -- password-gated, expires on a timer -- so it belongs with
            the other account settings. PromptEditor still says what is needed
            and now says where to find it. */}
        <ParentModeToggle />

        {/* Giving a character's spent points back. Here rather than on the
            character's own Stats tab because it is a grown-up's undo, not part
            of spending -- and because the sheet it rescues is usually one
            Parent Mode wrote over budget, which the Stats tab cannot save its
            way out of one click at a time. */}
        <ResetSheetCard />

        {/* Story Generation Stats */}
        <Card className="bg-card rounded-2xl shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl font-heading">Story Generation Quota</CardTitle>
            <CardDescription>
              Your free story generation usage and remaining quota
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <div className="py-8">
                <p className="text-center text-muted-foreground">Loading your story statistics...</p>
              </div>
            ) : storyStats ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Stories Generated</span>
                    <Badge variant="outline" className="bg-secondary/10">{storyStats.used}</Badge>
                  </div>
                  <Progress value={(storyStats.used / storyStats.total) * 100} className="h-2" />
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Remaining Free Stories</span>
                  <span className="font-bold text-lg">{storyStats.remaining}</span>
                </div>
                
                <div className="text-sm text-muted-foreground">
                  {storyStats.lastReset && <p>Last top-up: {formatDate(storyStats.lastReset)}</p>}
                  {/* Interpolated, not restated. This said "10" in prose, which
                      is how a sentence outlives the number it describes. */}
                  <p className="mt-1">
                    You start with {storyStats.total} and receive {storyStats.perMonth} more each
                    month, up to {storyStats.total}. Next on {formatDate(storyStats.nextTopUp)}.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-6">No usage statistics available</p>
            )}
          </CardContent>
          <CardFooter className="border-t p-4 bg-muted rounded-b-2xl">
            <p className="text-sm text-muted-foreground">
              Want unlimited stories? Add your own OpenAI API key.
            </p>
          </CardFooter>
        </Card>

        {/* OpenAI API Key */}
        <Card className="bg-card rounded-2xl shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl font-heading">OpenAI API Key</CardTitle>
            <CardDescription>
              Add your own OpenAI API key for unlimited story generation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasStoredKey ? (
              <Alert className="bg-success-surface border-success">
                <AlertTitle className="font-medium text-success">API Key Stored</AlertTitle>
                <AlertDescription className="text-success">
                  You have an OpenAI API key set up. You can generate unlimited stories with your key.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="apiKey">OpenAI API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Your API key is stored locally and is never shared. Get your API key from your OpenAI account.
                </p>
              </div>
            )}
            
            <div className="pt-4">
              <Label htmlFor="model">Story model</Label>
              <Select
                onValueChange={handleModelChange}
                value={selectedModel}
                disabled={isLoadingModels || models.length === 0}
              >
                <SelectTrigger id="model">
                  <SelectValue placeholder={isLoadingModels ? "Loading models…" : "Select model"} />
                </SelectTrigger>
                <SelectContent>
                  {TIER_ORDER.map((tier) => {
                    const inTier = models.filter((m) => m.tier === tier);
                    if (inTier.length === 0) return null;
                    return (
                      <SelectGroup key={tier}>
                        <SelectLabel>{TIER_LABELS[tier]}</SelectLabel>
                        {inTier.map((model) => (
                          <SelectItem
                            key={model.id}
                            value={model.id}
                            // Locked models stay visible but unselectable, so it
                            // is clear what supplying a key would unlock rather
                            // than the option simply being absent.
                            disabled={!model.allowed}
                          >
                            {model.label}
                            {!model.allowed && " — needs your own API key"}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>

              {selectedModelWarning && (
                <p className="text-xs text-warning mt-2">{selectedModelWarning}</p>
              )}

              <p className="text-xs text-muted-foreground mt-2">
                {hasStoredKey
                  ? "Your own API key is in use, so premium models are available and billed to your OpenAI account."
                  : "Local models run on this server and are free. Premium models need your own OpenAI API key."}
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end space-x-4 border-t p-4 bg-muted rounded-b-2xl">
            {hasStoredKey ? (
              <Button 
                variant="destructive" 
                onClick={handleDeleteApiKey} 
                disabled={isDeleting}
              >
                {isDeleting ? "Removing..." : "Remove API Key"}
              </Button>
            ) : (
              <Button 
                onClick={handleSubmitApiKey} 
                disabled={isSubmitting || !apiKey}
                className="bg-secondary hover:bg-secondary/90"
              >
                {isSubmitting ? "Saving..." : "Save API Key"}
              </Button>
            )}
          </CardFooter>
        </Card>
    </div>
  );
}
