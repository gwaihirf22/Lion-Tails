import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Copy, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// <<< CHANGED: New interface to match the multi-step debug data
interface DebugStep {
  step: string;
  prompt?: string;
  response?: string;
  wordCount?: number;
  targetWordCount?: number;
  model?: string;
  // Kept old fields for graceful fallback if old data is encountered
  systemPrompt?: string;
  userPrompt?: string;
  maxTokens?: number | string;
}

interface DebugPanelProps {
  debugData?: DebugStep[];
  isVisible?: boolean;
}

/**
 * A short, DISTINCT label for a step.
 *
 * The server names chapter steps "generateChapter: <first 30 chars of the
 * outline>...", which is too long for a tab, so the client showed only the part
 * before the colon -- and a five-chapter story then had five tabs all reading
 * "generateChapter". Numbering them by their position among the chapter steps
 * restores the distinction without needing the outline text or a server change.
 */
function stepLabel(
  step: string,
  index: number,
  all: Array<{ step: string }>,
): string {
  const name = step.split(":")[0].trim();
  if (!step.includes(":")) return name;
  const sameKind = all.filter((s) => s.step.split(":")[0].trim() === name);
  if (sameKind.length < 2) return name;
  const ordinal = all.slice(0, index + 1).filter((s) => s.step.split(":")[0].trim() === name).length;
  return `${name} ${ordinal}`;
}

export function DebugPanel({
  debugData = [],
  isVisible = false,
}: DebugPanelProps) {
  const [expanded, setExpanded] = useState(isVisible);
  const { toast } = useToast();

  const copyToClipboard = (text: string | undefined, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  if (!debugData.length && !expanded) return null;

  // <<< NEW: Calculate summary stats from the entire process
  const totalWordsGenerated = debugData.reduce(
    (acc, step) => acc + (step.wordCount || 0),
    0,
  );
  const finalTargetWords = debugData[0]?.targetWordCount || "N/A";
  const modelUsed = debugData[0]?.model || "N/A";

  return (
    <Card className="mt-4 border-warning bg-warning-surface">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg text-warning">
            OpenAI Debug Information
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-warning hover:text-warning"
          >
            {expanded ? (
              <ChevronUp className="mr-1" />
            ) : (
              <ChevronDown className="mr-1" />
            )}
            {expanded ? "Hide" : "Show"} Debug Info
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          {debugData.length === 0 ? (
            <p className="text-warning">No debug data available.</p>
          ) : (
            <>
              {/* <<< NEW: Overall Summary Section >>> */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 border rounded-lg bg-card">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Total Words Generated</p>
                  <p className="text-2xl font-bold text-warning">
                    {totalWordsGenerated}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Target Words</p>
                  <p className="text-2xl font-bold text-foreground">
                    {finalTargetWords}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Model</p>
                  <p className="text-lg font-semibold text-foreground">
                    {modelUsed}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Total Steps</p>
                  <p className="text-lg font-semibold text-success">
                    {debugData.length}
                  </p>
                </div>
              </div>

              {/* Tabs represent Steps, not Attempts.

                  The row used to be a grid of N equal 1fr columns. Step names
                  are far wider than 1/Nth of the panel -- "generateChapter"
                  plus a word-count badge in a seventh of the width -- and a
                  TabsTrigger does not clip its content, so every label spilled
                  across its neighbours and the row became unreadable. Equal
                  columns are the wrong model for labels of unequal length:
                  size each trigger to its own content and let the row wrap. */}
              <Tabs defaultValue="0" className="w-full">
                {/* h-auto is load-bearing: TabsList's base class is a fixed
                    h-10, so a wrapped second row would be clipped. Wrapping
                    rather than scrolling because a debug panel should never
                    hide a step behind a scroll position you cannot see. */}
                <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
                  {debugData.map((step, index) => (
                    <TabsTrigger
                      key={index}
                      value={index.toString()}
                      className="shrink-0 whitespace-nowrap"
                    >
                      {stepLabel(step.step, index, debugData)}
                      <Badge variant="secondary" className="ml-2">
                        {step.wordCount || 0}w
                      </Badge>
                    </TabsTrigger>
                  ))}
                </TabsList>
                {debugData.map((data, index) => (
                  <TabsContent
                    key={index}
                    value={index.toString()}
                    className="mt-4 space-y-4"
                  >
                    <CodeBlock
                      title="User Prompt"
                      content={data.prompt || data.userPrompt}
                      onCopy={() =>
                        copyToClipboard(
                          data.prompt || data.userPrompt,
                          "User Prompt",
                        )
                      }
                    />
                    <CodeBlock
                      title="OpenAI Response"
                      content={data.response}
                      onCopy={() =>
                        copyToClipboard(data.response, "OpenAI Response")
                      }
                      heightClass="h-48"
                    />
                  </TabsContent>
                ))}
              </Tabs>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// <<< NEW: Reusable component for displaying code blocks >>>
interface CodeBlockProps {
  title: string;
  content: string | undefined;
  onCopy: () => void;
  heightClass?: string;
}

function CodeBlock({
  title,
  content,
  onCopy,
  heightClass = "h-32",
}: CodeBlockProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-foreground">{title}</h4>
        <Button variant="outline" size="sm" onClick={onCopy}>
          <Copy className="w-4 h-4 mr-1" />
          Copy
        </Button>
      </div>
      <ScrollArea
        className={`${heightClass} w-full border rounded p-2 bg-muted`}
      >
        <pre className="text-xs whitespace-pre-wrap">
          {content || "Not available for this step."}
        </pre>
      </ScrollArea>
    </div>
  );
}
