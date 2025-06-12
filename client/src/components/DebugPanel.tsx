import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DebugData {
  systemPrompt: string;
  userPrompt: string;
  response: string;
  wordCount: number;
  targetWordCount: number;
  attempt: number;
  maxAttempts: number;
  timestamp: string;
  model: string;
  maxTokens: number | string;
}

interface DebugPanelProps {
  debugData?: DebugData[];
  isVisible?: boolean;
}

export function DebugPanel({ debugData = [], isVisible = false }: DebugPanelProps) {
  const [expanded, setExpanded] = useState(isVisible);
  const { toast } = useToast();

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  if (!debugData.length && !expanded) return null;

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
            {expanded ? <ChevronUp /> : <ChevronDown />}
            {expanded ? 'Hide' : 'Show'} Debug Info
          </Button>
        </div>
      </CardHeader>
      
      {expanded && (
        <CardContent>
          {debugData.length === 0 ? (
            <p className="text-orange-600">No debug data available. Generate a story to see OpenAI interaction details.</p>
          ) : (
            <Tabs defaultValue="0" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                {debugData.map((_, index) => (
                  <TabsTrigger key={index} value={index.toString()}>
                    Attempt {index + 1}
                    <Badge variant={index === debugData.length - 1 ? "default" : "secondary"} className="ml-2">
                      {debugData[index].wordCount}w
                    </Badge>
                  </TabsTrigger>
                ))}
              </TabsList>
              
              {debugData.map((data, index) => (
                <TabsContent key={index} value={index.toString()} className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Words Generated</p>
                      <p className="text-2xl font-bold text-orange-600">{data.wordCount}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Target Words</p>
                      <p className="text-2xl font-bold text-gray-800">{data.targetWordCount}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Model</p>
                      <p className="text-lg font-semibold text-blue-600">{data.model}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Max Tokens</p>
                      <p className="text-lg font-semibold text-green-600">{data.maxTokens}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-800">System Prompt</h4>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(data.systemPrompt, "System prompt")}
                        >
                          <Copy className="w-4 h-4 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <ScrollArea className="h-32 w-full border rounded p-2 bg-gray-50">
                        <pre className="text-xs whitespace-pre-wrap">{data.systemPrompt}</pre>
                      </ScrollArea>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-800">User Prompt</h4>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(data.userPrompt, "User prompt")}
                        >
                          <Copy className="w-4 h-4 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <ScrollArea className="h-32 w-full border rounded p-2 bg-gray-50">
                        <pre className="text-xs whitespace-pre-wrap">{data.userPrompt}</pre>
                      </ScrollArea>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-800">OpenAI Response</h4>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(data.response, "OpenAI response")}
                        >
                          <Copy className="w-4 h-4 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <ScrollArea className="h-48 w-full border rounded p-2 bg-gray-50">
                        <pre className="text-xs whitespace-pre-wrap">{data.response}</pre>
                      </ScrollArea>
                    </div>
                  </div>
                  
                  <div className="text-xs text-gray-500">
                    Generated at: {data.timestamp}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      )}
    </Card>
  );
}