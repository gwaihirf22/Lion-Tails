import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Copy, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Updated interface to match the new multi-step debug data structure
interface DebugStep {
  step: string;
  prompt?: string;
  response?: string;
  wordCount?: number;
  targetWordCount?: number;
  model?: string;
  timestamp?: string;
  attempt?: number;
  maxAttempts?: number;
  // Legacy fields for backward compatibility
  systemPrompt?: string;
  userPrompt?: string;
  maxTokens?: number | string;
  parseError?: string;
}

interface DebugPanelProps {
  debugData?: DebugStep[];
  isVisible?: boolean;
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
    <Card className="mt-4 border-orange-200 bg-orange-50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg text-orange-800">
            OpenAI Debug Information
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-orange-600 hover:text-orange-800"
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
            <p className="text-orange-600">No debug data available.</p>
          ) : (
            <>
              {/* <<< NEW: Overall Summary Section >>> */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 border rounded-lg bg-white">
                <div className="text-center">
                  <p className="text-sm text-gray-600">Total Words Generated</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {totalWordsGenerated}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">Target Words</p>
                  <p className="text-2xl font-bold text-gray-800">
                    {finalTargetWords}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">Model</p>
                  <p className="text-lg font-semibold text-blue-600">
                    {modelUsed}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">Total Steps</p>
                  <p className="text-lg font-semibold text-green-600">
                    {debugData.length}
                  </p>
                </div>
              </div>

              {/* <<< CHANGED: Tabs now represent Steps, not Attempts >>> */}
              <Tabs defaultValue="0" className="w-full">
                <TabsList
                  className="grid w-full"
                  style={{
                    gridTemplateColumns: `repeat(${debugData.length}, minmax(0, 1fr))`,
                  }}
                >
                  {debugData.map((step, index) => {
                    const stepName = step.step.includes("generateChapter") 
                      ? `Chapter ${index}` 
                      : step.step.includes("generateOutline") 
                        ? "Outline"
                        : step.step.includes("generateShortStorySingleCall")
                          ? "Single Call"
                          : step.step.includes("finalizeStory")
                            ? "Finalize"
                            : step.step.split(":")[0];
                    
                    return (
                      <TabsTrigger key={index} value={index.toString()}>
                        {stepName}
                        <Badge variant="secondary" className="ml-2">
                          {step.wordCount || 0}w
                        </Badge>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                {debugData.map((data, index) => (
                  <TabsContent
                    key={index}
                    value={index.toString()}
                    className="mt-4 space-y-4"
                  >
                    {/* Step Details Header */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-gray-50 rounded-lg text-sm">
                      <div>
                        <span className="font-medium text-gray-700">Step:</span>
                        <p className="text-gray-900">{data.step}</p>
                      </div>
                      {data.wordCount && (
                        <div>
                          <span className="font-medium text-gray-700">Words:</span>
                          <p className="text-gray-900">{data.wordCount}</p>
                        </div>
                      )}
                      {data.targetWordCount && (
                        <div>
                          <span className="font-medium text-gray-700">Target:</span>
                          <p className="text-gray-900">{data.targetWordCount}</p>
                        </div>
                      )}
                      {data.model && (
                        <div>
                          <span className="font-medium text-gray-700">Model:</span>
                          <p className="text-gray-900">{data.model}</p>
                        </div>
                      )}
                    </div>

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
                    
                    {/* Legacy fields for backward compatibility */}
                    {data.systemPrompt && (
                      <CodeBlock
                        title="System Prompt (Legacy)"
                        content={data.systemPrompt}
                        onCopy={() =>
                          copyToClipboard(data.systemPrompt, "System Prompt")
                        }
                      />
                    )}
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
        <h4 className="font-semibold text-gray-800">{title}</h4>
        <Button variant="outline" size="sm" onClick={onCopy}>
          <Copy className="w-4 h-4 mr-1" />
          Copy
        </Button>
      </div>
      <ScrollArea
        className={`${heightClass} w-full border rounded p-2 bg-gray-50`}
      >
        <pre className="text-xs whitespace-pre-wrap">
          {content || "Not available for this step."}
        </pre>
      </ScrollArea>
    </div>
  );
}
