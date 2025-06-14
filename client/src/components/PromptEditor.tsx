import { useState, useEffect } from "react";
import { useParentMode } from "@/hooks/use-parent-mode";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger 
} from "@/components/ui/dialog";
import { 
  Edit3, 
  Eye, 
  RotateCcw, 
  CheckCircle, 
  AlertTriangle, 
  Info,
  Code2
} from "lucide-react";
import type { StoryRequest } from "@shared/schema";

interface PromptEditorProps {
  storyRequest: StoryRequest;
  onPromptsChanged: (systemPrompt: string, userPrompt: string) => void;
  className?: string;
}

interface PromptValidation {
  isValid: boolean;
  warnings: string[];
  suggestions: string[];
}

const generateDefaultSystemPrompt = (storyRequest: StoryRequest) => {
  const lengthMapping = {
    "very-short": "500-700 words",
    "short": "700-1000 words", 
    "medium": "1000-1500 words",
    "long": "1500-2500 words",
    "extended": "2500+ words (20+ minutes reading time)"
  };

  const readingLevelMapping = {
    "preschool": "ages 3-4",
    "kindergarten": "ages 5-6", 
    "early-elementary": "ages 6-8",
    "late-elementary": "ages 9-11",
    "middle-school": "ages 12-14"
  };

  const targetLength = lengthMapping[storyRequest.storyLength] || "1000+ words";
  const targetAge = readingLevelMapping[storyRequest.readingLevel] || "ages 4-12";

  return `You are a Christian children's storyteller who creates engaging, faith-based stories that teach valuable lessons. Your stories should be:

1. Age-appropriate and engaging for children ${targetAge}
2. Incorporate biblical values and Christian themes naturally
3. Feature relatable characters and situations
4. Include a clear moral lesson or spiritual truth
5. Be approximately ${targetLength} in length
6. End with 5 application questions to help children apply the lesson

Story Structure:
- Compelling opening that captures attention
- Character development and relatable situations
- Rising action with challenges or conflicts
- Resolution that demonstrates faith, love, or biblical principles
- Clear moral lesson woven throughout
- 5 practical application questions at the end

Content Guidelines:
- Use simple, age-appropriate language appropriate for ${targetAge}
- Avoid scary or inappropriate content
- Emphasize God's love, grace, and care
- Show characters learning from mistakes
- Include elements of adventure, friendship, or family
- Reference biblical stories or principles when appropriate`;
};

export default function PromptEditor({ storyRequest, onPromptsChanged, className }: PromptEditorProps) {
  const { isActive } = useParentMode();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [systemPromptManuallyEdited, setSystemPromptManuallyEdited] = useState(false);
  const [userPromptManuallyEdited, setUserPromptManuallyEdited] = useState(false);
  const [validation, setValidation] = useState<PromptValidation>({ 
    isValid: true, 
    warnings: [], 
    suggestions: [] 
  });

  // Generate both system and user prompts from story request - updates when storyRequest changes
  useEffect(() => {
    const generateUserPrompt = () => {
      let prompt = `Please create a complete, faith-based children's story.\n\n`;
      
      // Character Details Section
      prompt += `Character Details:\n`;
      if (storyRequest.childName) {
        prompt += `- Main Character: ${storyRequest.childName}`;
        if (storyRequest.gender) prompt += ` (${storyRequest.gender}`;
        if (storyRequest.characterDetails?.age) prompt += `, ${storyRequest.characterDetails.age} years old`;
        if (storyRequest.gender) prompt += `)`;
        prompt += `\n`;
      }
      if (storyRequest.animal && storyRequest.useAnimal && storyRequest.animal !== "none") {
        prompt += `- Favorite Animal: ${storyRequest.animal}\n`;
      }
      
      // Story Details Section
      if (storyRequest.theme && storyRequest.theme !== "none") {
        prompt += `- Theme: ${storyRequest.theme}\n`;
      }
      if (storyRequest.biblicalEvent && storyRequest.biblicalEvent !== "none") {
        prompt += `- Biblical Event: ${storyRequest.biblicalEvent}\n`;
      }
      if (storyRequest.heroOfFaith && storyRequest.heroOfFaith !== "none") {
        prompt += `- Hero of Faith: ${storyRequest.heroOfFaith}\n`;
      }
      if (storyRequest.biblePassage) {
        prompt += `- Bible Passage: ${storyRequest.biblePassage}\n`;
      }
      if (storyRequest.useTimeTravel) {
        prompt += `- Include Time Travel Elements: Yes\n`;
      }
      
      prompt += `- Reading Level: ${storyRequest.readingLevel}\n`;
      prompt += `- Story Length: ${storyRequest.storyLength}\n`;
      
      const lengthMapping = {
        "very-short": "500",
        "short": "1000", 
        "medium": "1500",
        "long": "2500",
        "extended": "3500"
      };
      
      const targetWords = lengthMapping[storyRequest.storyLength as keyof typeof lengthMapping] || "1500";
      prompt += `\nCRITICAL INSTRUCTION: The entire story's content MUST be approximately ${targetWords} words long.\n\n`;
      prompt += `Respond with a single, valid JSON object with the following structure:\n`;
      prompt += `{\n`;
      prompt += `  "title": "A creative story title",\n`;
      prompt += `  "content": "The full story text, approximately ${targetWords} words.",\n`;
      prompt += `  "applicationQuestions": ["Question 1", "Question 2", "Question 3", "Question 4", "Question 5"],\n`;
      prompt += `  "imagePrompt": "A short description for an illustrator for a key scene."\n`;
      prompt += `}`;
      
      return prompt;
    };

    // Only update prompts if they haven't been manually edited
    const newSystemPrompt = generateDefaultSystemPrompt(storyRequest);
    const newUserPrompt = generateUserPrompt();
    
    if (!systemPromptManuallyEdited) {
      setSystemPrompt(newSystemPrompt);
    }
    
    if (!userPromptManuallyEdited) {
      setUserPrompt(newUserPrompt);
    }
  }, [storyRequest, systemPromptManuallyEdited, userPromptManuallyEdited]);

  // Validate prompts
  useEffect(() => {
    validatePrompts();
  }, [systemPrompt, userPrompt]);

  const validatePrompts = () => {
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Check system prompt
    if (systemPrompt.length < 100) {
      warnings.push("System prompt seems very short - consider adding more detailed instructions");
    }
    if (!systemPrompt.toLowerCase().includes('christian') && !systemPrompt.toLowerCase().includes('faith')) {
      warnings.push("System prompt may not emphasize Christian/faith elements");
    }
    if (!systemPrompt.toLowerCase().includes('children')) {
      warnings.push("System prompt should specify content is for children");
    }

    // Check user prompt
    if (userPrompt.length < 50) {
      warnings.push("User prompt seems very short - more details usually generate better stories");
    }

    // Suggestions
    if (!systemPrompt.toLowerCase().includes('application questions')) {
      suggestions.push("Consider adding instructions for application questions in system prompt");
    }
    if (!systemPrompt.toLowerCase().includes('1000')) {
      suggestions.push("Consider specifying story length in system prompt");
    }

    setValidation({
      isValid: warnings.length === 0,
      warnings,
      suggestions
    });
  };

  const handleSavePrompts = () => {
    onPromptsChanged(systemPrompt, userPrompt);
    setDialogOpen(false);
  };

  const handleResetPrompts = () => {
    setSystemPromptManuallyEdited(false);
    setUserPromptManuallyEdited(false);
    // Prompts will be regenerated from story request via useEffect when manually edited flags are reset
  };

  const getPromptPreview = (prompt: string, maxLength: number = 150) => {
    return prompt.length > maxLength ? prompt.substring(0, maxLength) + "..." : prompt;
  };

  if (!isActive) {
    return (
      <Card className={`border-gray-200 bg-gray-50 ${className}`}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center space-x-2 text-gray-500">
            <Edit3 className="h-5 w-5" />
            <span className="text-sm">Prompt editing requires Parent Mode</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`border-amber-200 bg-amber-50 ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Code2 className="h-5 w-5 text-amber-600" />
            <CardTitle className="text-lg text-amber-800">AI Prompt Editor</CardTitle>
            <Badge variant="secondary" className="bg-green-100 text-green-700">
              Parent Mode Active
            </Badge>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700">
                <Edit3 className="h-4 w-4 mr-2" />
                Edit Prompts
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center space-x-2">
                  <Code2 className="h-5 w-5 text-amber-600" />
                  <span>Advanced Prompt Editor</span>
                </DialogTitle>
                <DialogDescription>
                  Customize the AI prompts used for story generation. System prompts define behavior, user prompts provide story details.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                {/* Validation Status */}
                {(!validation.isValid || validation.suggestions.length > 0) && (
                  <div className="space-y-2">
                    {validation.warnings.map((warning, index) => (
                      <Alert key={index} className="bg-yellow-50 border-yellow-200">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        <AlertDescription className="text-yellow-700">{warning}</AlertDescription>
                      </Alert>
                    ))}
                    {validation.suggestions.map((suggestion, index) => (
                      <Alert key={index} className="bg-blue-50 border-blue-200">
                        <Info className="h-4 w-4 text-blue-600" />
                        <AlertDescription className="text-blue-700">{suggestion}</AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}

                <Tabs defaultValue="system" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="system">System Prompt</TabsTrigger>
                    <TabsTrigger value="user">User Prompt</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="system" className="space-y-4">
                    <div>
                      <Label htmlFor="system-prompt" className="text-base font-medium">
                        System Prompt
                      </Label>
                      <p className="text-sm text-muted-foreground mb-2">
                        Defines the AI's role, behavior, and output format. This controls how the AI interprets and responds to requests.
                      </p>
                      <Textarea
                        id="system-prompt"
                        value={systemPrompt}
                        onChange={(e) => {
                          setSystemPrompt(e.target.value);
                          setSystemPromptManuallyEdited(true);
                        }}
                        className="min-h-[300px] font-mono text-sm"
                        placeholder="Enter system prompt..."
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        {systemPrompt.length} characters
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="user" className="space-y-4">
                    <div>
                      <Label htmlFor="user-prompt" className="text-base font-medium">
                        User Prompt
                      </Label>
                      <p className="text-sm text-muted-foreground mb-2">
                        The specific request sent to the AI, generated from your story parameters. You can customize this for more specific results.
                      </p>
                      <Textarea
                        id="user-prompt"
                        value={userPrompt}
                        onChange={(e) => {
                          setUserPrompt(e.target.value);
                          setUserPromptManuallyEdited(true);
                        }}
                        className="min-h-[200px] font-mono text-sm"
                        placeholder="Enter user prompt..."
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        {userPrompt.length} characters
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex justify-between">
                  <Button
                    onClick={handleResetPrompts}
                    variant="outline"
                    className="flex items-center space-x-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Reset to Default</span>
                  </Button>
                  <div className="space-x-2">
                    <Button
                      onClick={() => setDialogOpen(false)}
                      variant="outline"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSavePrompts}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Save Changes
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Label className="text-sm font-medium text-amber-700">System Prompt</Label>
              <Eye className="h-4 w-4 text-amber-600" />
              {systemPromptManuallyEdited && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                  Custom
                </Badge>
              )}
            </div>
            <div className="bg-white p-3 rounded border border-amber-200 text-xs">
              <code className="text-gray-700">{getPromptPreview(systemPrompt)}</code>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Label className="text-sm font-medium text-amber-700">User Prompt</Label>
              <Eye className="h-4 w-4 text-amber-600" />
              {userPromptManuallyEdited && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                  Custom
                </Badge>
              )}
            </div>
            <div className="bg-white p-3 rounded border border-amber-200 text-xs">
              <code className="text-gray-700">{getPromptPreview(userPrompt)}</code>
            </div>
          </div>
        </div>

        <Alert className="bg-amber-50 border-amber-200">
          <Info className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-700 text-sm">
            Prompts automatically update when you change form fields. Once you manually edit a prompt, 
            it becomes "Custom" and stops auto-updating. Use "Reset to Default" to restore live updates.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}