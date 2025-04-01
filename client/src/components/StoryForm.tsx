import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage,
  FormDescription
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { StoryRequest, storyRequestSchema, type Character } from "@shared/schema";
import { Textarea } from "@/components/ui/textarea";

interface StoryFormProps {
  onSubmit: (data: StoryRequest) => void;
  loading?: boolean;
  formType?: "children" | "historical";
  showChildFields?: boolean;
  showTimeTravel?: boolean;
  showAnimalToggle?: boolean;
  showBiblicalEvent?: boolean;
  showHeroOfFaith?: boolean;
  showBiblePassageField?: boolean;
  showHistoricalAccuracyToggle?: boolean;
  showLearningFocus?: boolean;
  showReadingLevel?: boolean;
  showStoryLength?: boolean;
  showCustomCharacter?: boolean;
}

export default function StoryForm({ 
  onSubmit, 
  loading = false,
  formType = "children",
  showChildFields = true,
  showTimeTravel = true,
  showAnimalToggle = true,
  showBiblicalEvent = false,
  showHeroOfFaith = true,
  showBiblePassageField = true,
  showHistoricalAccuracyToggle = false,
  showLearningFocus = false,
  showReadingLevel = true,
  showStoryLength = true,
  showCustomCharacter = true
}: StoryFormProps) {
  const [useTimeTravel, setUseTimeTravel] = useState(false);
  const [hasSelectedBiblicalEvent, setHasSelectedBiblicalEvent] = useState(false);
  const [hasSelectedHeroOfFaith, setHasSelectedHeroOfFaith] = useState(false);
  const [isBiblicalNarrative, setIsBiblicalNarrative] = useState(false);
  const [historicalAccuracy, setHistoricalAccuracy] = useState(true);
  
  // Fetch characters for selection - always fetch them as they can be used in any story type
  const { data: characters = [], isLoading: charactersLoading } = useQuery<Character[]>({
    queryKey: ['/api/characters'],
    queryFn: getQueryFn<Character[]>({
      on401: "throw"
    }),
    // Always fetch characters as they can be used in any story type
    enabled: true,
  });
  
  // Fetch heroes of faith for selection
  const { data: heroesOfFaith = [], isLoading: heroesLoading } = useQuery({
    queryKey: ['/api/heroes'],
    queryFn: getQueryFn<any[]>({
      on401: "returnNull"
    }),
    enabled: showHeroOfFaith
  });
  
  // Check localStorage for a pre-selected hero of faith
  const selectedHeroFromStorage = typeof window !== 'undefined' ? localStorage.getItem('selectedHeroOfFaith') : null;
  
  const form = useForm<StoryRequest>({
    resolver: zodResolver(storyRequestSchema),
    defaultValues: {
      childName: "",
      gender: "boy",
      animal: "", // No default animal
      useAnimal: true, // Default to including animals if selected
      theme: "", // No default theme
      biblicalEvent: "", // No default biblical event
      heroOfFaith: selectedHeroFromStorage || "", // Use hero from localStorage if available
      storyType: formType === "children" ? "regular" : "biblical_narrative", // Default based on form type
      useTimeTravel: false,
      characterId: undefined,
      customPrompt: "", // Empty custom prompt by default
      biblePassage: "", // New field for Bible passage study
      historicalAccuracy: true, // Default to historically accurate
      learningFocus: "", // No default learning focus
      // New fields
      readingLevel: "early-elementary", // Default reading level
      storyLength: "medium", // Default story length
      useCharacter: false, // Default to not using custom character
      characterDetails: {
        age: 8,
        hair: "",
        eyes: "",
        favoriteColor: "",
        personality: "",
        hobby: "",
        specialPower: "",
        favoriteAnimal: ""
      },
    },
  });
  
  // Effect to set hasSelectedHeroOfFaith based on selectedHeroFromStorage
  useEffect(() => {
    if (selectedHeroFromStorage) {
      setHasSelectedHeroOfFaith(true);
      
      // If we're in historical mode and have a hero selected, make sure biblical event is cleared
      if (formType === "historical") {
        form.setValue("biblicalEvent", "");
        setHasSelectedBiblicalEvent(false);
      }
      
      // Clear localStorage after we've used the value
      localStorage.removeItem('selectedHeroOfFaith');
    }
  }, [selectedHeroFromStorage, form, formType]);

  // Update the form when the time travel checkbox or biblical narrative option changes
  useEffect(() => {
    form.setValue("useTimeTravel", useTimeTravel);
    
    if (formType === "historical") {
      // In historical mode, child's name, gender, and animal are not needed
      form.clearErrors(['childName', 'gender', 'animal']);
      
      // Set default values for these fields that satisfy type constraints
      form.setValue("childName", "Biblical Character");
      form.setValue("gender", "boy");  // Must be "boy" or "girl", not empty string
      form.setValue("animal", "none");
      form.setValue("storyType", "biblical_narrative");
      
      // Keep character selection even for historical mode
      // Character selection remains optional; don't clear it
      form.setValue("useTimeTravel", false);
      
      // Set historical accuracy
      form.setValue("historicalAccuracy", historicalAccuracy);
    } 
    else if (isBiblicalNarrative) {
      // In biblical narrative mode, child's name, gender, and animal are not needed
      form.clearErrors(['childName', 'gender', 'animal']);
      
      // Set default values for these fields that satisfy type constraints
      form.setValue("childName", "Biblical Character");
      form.setValue("gender", "boy");  // Must be "boy" or "girl", not empty string
      form.setValue("animal", "none");
      
      // Keep character selection even for biblical narrative
      // Character selection remains optional; don't clear it
      
      // Make sure time travel is disabled for biblical narrative
      if (useTimeTravel) {
        setUseTimeTravel(false);
        form.setValue("useTimeTravel", false);
      }
    } 
    else if (useTimeTravel) {
      // In time travel mode, child's name, gender, and animal are not needed
      // (they will be handled by the character's details)
      form.clearErrors(['childName', 'gender', 'animal']);
      
      // Set default values for these fields so they don't get sent to the server
      form.setValue("childName", "Character");
      form.setValue("gender", "boy");  // Must be "boy" or "girl", not empty string
      form.setValue("animal", "none");
      
      // Set focus on character selection dropdown
      setTimeout(() => {
        const characterDropdown = document.querySelector('[name="characterId"]');
        if (characterDropdown) {
          (characterDropdown as HTMLElement).focus();
        }
      }, 100);
    } 
    // Keep character selection even when time travel is not enabled
    // This allows using the character in regular stories too
  }, [useTimeTravel, isBiblicalNarrative, form, formType, historicalAccuracy]);

  // Character creation is now handled exclusively through the Character tab

  return (
    <Card className={`content-container rounded-2xl shadow-lg ${formType === "historical" ? "border-amber-200" : "border-blue-200"}`}>
      <CardContent className="p-6">
        {/* Only show child fields when needed */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Character Selection - Moved to the top and available for all story types, including biblical narratives */}
            {(formType === "children" || formType === "historical") && (
              <FormField
                control={form.control}
                name="characterId"
                render={({ field }) => (
                  <FormItem className="mb-4">
                    <FormLabel className="text-sm font-medium">Select Character</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-secondary z-10">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-user">
                            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                          </svg>
                        </span>
                        <Select
                          onValueChange={(value) => {
                            // When a character is selected, ensure time travel characters work properly
                            if (value) {
                              // No need for useCharacter flag since we're using the characterId directly
                            }
                            field.onChange(value);
                          }}
                          value={field.value}
                          disabled={charactersLoading}
                        >
                          <SelectTrigger className="pl-10 pr-4 py-2 border border-secondary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary">
                            <SelectValue placeholder={charactersLoading ? "Loading characters..." : "Select a character for your story"} />
                          </SelectTrigger>
                          <SelectContent>
                            {characters.length === 0 ? (
                              <SelectItem value="create-new" disabled>
                                Create a character in the Character Creator first
                              </SelectItem>
                            ) : (
                              characters.map((character) => (
                                <SelectItem key={character.id} value={character.id}>
                                  {character.name} ({character.gender}, {character.age} years old)
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </FormControl>
                    <FormDescription>
                      Select an existing character to use in your story. Characters can be used with any story type (Regular Bedtime Story, Moral Bedtime Story, Biblical Narrative, or even with Time Travel).
                    </FormDescription>
                    <FormMessage />
                    <div className="flex justify-between mt-1">
                      {characters.length === 0 && (
                        <div className="text-xs text-secondary/70">
                          <a href="/characters" className="text-secondary font-medium underline">
                            Click here to create a character for stories
                          </a>
                        </div>
                      )}
                      {field.value && (
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm" 
                          className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => field.onChange(undefined)}
                        >
                          Reset Selection
                        </Button>
                      )}
                    </div>
                  </FormItem>
                )}
              />
            )}

            {formType === "children" && showChildFields && !isBiblicalNarrative && !form.getValues("characterId") && (
              <>
                <FormField
                  control={form.control}
                  name="childName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Child's Name</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-secondary">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-user-round">
                              <circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 1 0-16 0" />
                            </svg>
                          </span>
                          <Input 
                            placeholder="Enter child's name" 
                            className="pl-10 pr-4 py-2 border border-secondary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary"
                            {...field} 
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Child's Gender</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-secondary z-10">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-heart">
                              <path d="M7 3C4.239 3 2 5.216 2 7.95c0 2.207.875 7.445 9.488 12.74a.985.985 0 0 0 1.024 0C21.125 15.395 22 10.157 22 7.95 22 5.216 19.761 3 17 3s-5 3-5 3-2.239-3-5-3z" />
                            </svg>
                          </span>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <SelectTrigger className="pl-10 pr-4 py-2 border border-secondary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary">
                              <SelectValue placeholder="Select gender" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="boy">Boy</SelectItem>
                              <SelectItem value="girl">Girl</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="animal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Favorite Animal</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-secondary z-10">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-dog">
                              <path d="M10 5.172C10 3.782 8.423 2.679 6.5 3c-2.823.47-4.113 6.006-4 7 .08.703 1.725 1.722 3.656 1 1.261-.472 1.96-1.45 2.344-2.5" /><path d="M14.267 5.172c0-1.39 1.577-2.493 3.5-2.172 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5" /><path d="M8 14v.5" /><path d="M16 14v.5" /><path d="M11.25 16.25h1.5L12 17l-.75-.75Z" /><path d="M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 17.59 7 20 12 20s8-2.41 8-5.444c0-1.135-.134-2.252-.396-3.309" />
                            </svg>
                          </span>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <SelectTrigger className="pl-10 pr-4 py-2 border border-secondary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary">
                              <SelectValue placeholder="Select an animal if desired" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="lion">Lion</SelectItem>
                              <SelectItem value="lamb">Lamb</SelectItem>
                              <SelectItem value="dove">Dove</SelectItem>
                              <SelectItem value="fish">Fish</SelectItem>
                              <SelectItem value="sheep">Sheep</SelectItem>
                              <SelectItem value="camel">Camel</SelectItem>
                              <SelectItem value="dog">Dog</SelectItem>
                              <SelectItem value="cat">Cat</SelectItem>
                              <SelectItem value="elephant">Elephant</SelectItem>
                              <SelectItem value="giraffe">Giraffe</SelectItem>
                              <SelectItem value="tiger">Tiger</SelectItem>
                              <SelectItem value="bear">Bear</SelectItem>
                              <SelectItem value="donkey">Donkey</SelectItem>
                              <SelectItem value="fox">Fox</SelectItem>
                              <SelectItem value="whale">Whale</SelectItem>
                              <SelectItem value="rabbit">Rabbit</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {showAnimalToggle && (
                  <FormField
                    control={form.control}
                    name="useAnimal"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md p-2 border border-secondary/10">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-sm font-medium">
                            Include Animals in Story
                          </FormLabel>
                          <div className="text-xs text-secondary/70">
                            When enabled, the selected animal will be included in the story.
                            When disabled, the story will not mention any animals even if one is selected above.
                          </div>
                        </div>
                      </FormItem>
                    )}
                  />
                )}
              </>
            )}
            
            {formType === "children" && (
              <FormField
                control={form.control}
                name="theme"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Theme/Message</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-secondary z-10">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-heart">
                            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                          </svg>
                        </span>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <SelectTrigger className="pl-10 pr-4 py-2 border border-secondary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary">
                            <SelectValue placeholder="Select a theme if desired" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="kindness">Kindness</SelectItem>
                            <SelectItem value="courage">Courage</SelectItem>
                            <SelectItem value="obedience">Obedience</SelectItem>
                            <SelectItem value="forgiveness">Forgiveness</SelectItem>
                            <SelectItem value="gratitude">Gratitude</SelectItem>
                            <SelectItem value="patience">Patience</SelectItem>
                            <SelectItem value="faith">Faith</SelectItem>
                            <SelectItem value="honesty">Honesty</SelectItem>
                            <SelectItem value="humility">Humility</SelectItem>
                            <SelectItem value="love">Love</SelectItem>
                            <SelectItem value="joy">Joy</SelectItem>
                            <SelectItem value="peace">Peace</SelectItem>
                            <SelectItem value="trust">Trust</SelectItem>
                            <SelectItem value="wisdom">Wisdom</SelectItem>
                            <SelectItem value="prayer">Prayer</SelectItem>
                            <SelectItem value="gentleness">Gentleness</SelectItem>
                            <SelectItem value="self-control">Self-Control</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            {formType === "children" && (
              <FormField
                control={form.control}
                name="storyType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Story Type</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-secondary z-10">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-book-open">
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                          </svg>
                        </span>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value);
                            setIsBiblicalNarrative(value === "biblical_narrative");
                          }}
                          defaultValue={field.value}
                        >
                          <SelectTrigger className="pl-10 pr-4 py-2 border border-secondary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary">
                            <SelectValue placeholder="Select story type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="regular">Regular Bedtime Story</SelectItem>
                            <SelectItem value="poem">Bedtime Poem</SelectItem>
                            <SelectItem value="moral">Moral Bedtime Story</SelectItem>
                            <SelectItem value="biblical_narrative">Biblical Narrative</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            {formType === "children" && showTimeTravel && !isBiblicalNarrative && (
              <FormField
                control={form.control}
                name="useTimeTravel"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md p-4 border border-secondary/10">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          setUseTimeTravel(!!checked);
                          field.onChange(checked);
                        }}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-sm font-medium">
                        Time Travel Adventure
                      </FormLabel>
                      <FormDescription>
                        Enable this to create a time travel adventure where your character visits Biblical times. This only affects the story theme, not character selection.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            )}
            
            {/* Character selection has been moved to the top of the form */}
            
            {showBiblicalEvent && (formType === "historical" || isBiblicalNarrative) && (
              <FormField
                control={form.control}
                name="biblicalEvent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Biblical Event</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-secondary z-10">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-book">
                            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                          </svg>
                        </span>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value);
                            setHasSelectedBiblicalEvent(value !== "none" && value !== "");
                            // Clear hero of faith if biblical event is selected
                            if (value !== "none" && value !== "") {
                              form.setValue("heroOfFaith", "");
                              setHasSelectedHeroOfFaith(false);
                            }
                          }}
                          value={field.value}
                        >
                          <SelectTrigger className="pl-10 pr-4 py-2 border border-secondary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary">
                            <SelectValue placeholder="Select a Biblical event" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="creation">Creation</SelectItem>
                            <SelectItem value="noah">Noah's Ark</SelectItem>
                            <SelectItem value="abraham">Abraham's Journey</SelectItem>
                            <SelectItem value="joseph">Joseph in Egypt</SelectItem>
                            <SelectItem value="moses">Moses and the Exodus</SelectItem>
                            <SelectItem value="joshua">Joshua and the Battle of Jericho</SelectItem>
                            <SelectItem value="davidGoliath">David and Goliath</SelectItem>
                            <SelectItem value="daniel">Daniel in the Lion's Den</SelectItem>
                            <SelectItem value="jonah">Jonah and the Whale</SelectItem>
                            <SelectItem value="nativity">The Nativity of Jesus</SelectItem>
                            <SelectItem value="miracles">Jesus' Miracles</SelectItem>
                            <SelectItem value="parables">Jesus' Parables</SelectItem>
                            <SelectItem value="crucifixion">The Crucifixion</SelectItem>
                            <SelectItem value="resurrection">The Resurrection</SelectItem>
                            <SelectItem value="pentecost">Day of Pentecost</SelectItem>
                            <SelectItem value="paul">Paul's Missionary Journeys</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            {showHeroOfFaith && (
              <FormField
                control={form.control}
                name="heroOfFaith"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Heroes of the Faith</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-secondary z-10">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-crown">
                            <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" />
                          </svg>
                        </span>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value);
                            setHasSelectedHeroOfFaith(value !== "none" && value !== "");
                            // Clear biblical event if hero is selected
                            if (value !== "none" && value !== "" && formType === "historical") {
                              form.setValue("biblicalEvent", "");
                              setHasSelectedBiblicalEvent(false);
                            }
                          }}
                          value={field.value}
                          disabled={heroesLoading || (formType === "historical" && hasSelectedBiblicalEvent)}
                        >
                          <SelectTrigger className="pl-10 pr-4 py-2 border border-secondary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary">
                            <SelectValue placeholder={heroesLoading ? "Loading heroes..." : "Select a Hero of the Faith"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {heroesOfFaith.map((hero) => (
                              <SelectItem key={hero.id} value={hero.id}>
                                {hero.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </FormControl>
                    <FormMessage />
                    {formType === "historical" && hasSelectedBiblicalEvent && (
                      <div className="text-xs text-secondary/70 mt-1">
                        You can only select a Hero of Faith or a Biblical Event, not both.
                      </div>
                    )}
                  </FormItem>
                )}
              />
            )}
            
            {showBiblePassageField && (
              <FormField
                control={form.control}
                name="biblePassage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Bible Passage to Study (Optional)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-secondary">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-book-open-text">
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /><path d="M6 8h2" /><path d="M6 12h2" /><path d="M16 8h2" /><path d="M16 12h2" />
                          </svg>
                        </span>
                        <Input 
                          placeholder="e.g. John 3:16 or Psalm 23" 
                          className="pl-10 pr-4 py-2 border border-secondary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary"
                          {...field} 
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      Enter a specific Bible verse or passage to include in the story.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            {showHistoricalAccuracyToggle && formType === "historical" && (
              <FormField
                control={form.control}
                name="historicalAccuracy"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md p-4 border border-secondary/10">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          setHistoricalAccuracy(!!checked);
                          field.onChange(checked);
                        }}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-sm font-medium">
                        Prioritize Historical Accuracy
                      </FormLabel>
                      <FormDescription>
                        When enabled, stories will focus more on historical facts. When disabled, more creative elements may be included.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            )}
            
            {showLearningFocus && formType === "historical" && (
              <FormField
                control={form.control}
                name="learningFocus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Learning Focus (Optional)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-secondary z-10">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-graduation-cap">
                            <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" />
                          </svg>
                        </span>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <SelectTrigger className="pl-10 pr-4 py-2 border border-secondary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary">
                            <SelectValue placeholder="What would you like to focus on?" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No specific focus</SelectItem>
                            <SelectItem value="historical-context">Historical Context</SelectItem>
                            <SelectItem value="theological-significance">Theological Significance</SelectItem>
                            <SelectItem value="moral-lessons">Moral Lessons</SelectItem>
                            <SelectItem value="cultural-insights">Cultural Insights</SelectItem>
                            <SelectItem value="character-development">Character Development</SelectItem>
                            <SelectItem value="faith-application">Faith Application Today</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            {/* Custom Prompt Field */}
            <FormField
              control={form.control}
              name="customPrompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Custom Story Request (Optional)</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute top-3 left-3 text-secondary">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-magic-wand">
                          <path d="M6 10.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5z" /><path d="m2 2 8 8" /><path d="M20.5 10.5 22 12l-7.5 7.5-6-6L10 12l1.5-1.5" /><path d="M10.5 13.5 14 17" /><path d="M15 4h5v5" /><path d="M19 10 9 20" />
                        </svg>
                      </span>
                      <Textarea 
                        placeholder="Add any custom elements you'd like in your story..." 
                        className="pl-10 pr-4 py-2 min-h-24 border border-secondary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary"
                        {...field} 
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    Optionally add specific details or elements you'd like included in your story.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Reading Level */}
            {showReadingLevel && (
              <FormField
                control={form.control}
                name="readingLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Reading Level</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-secondary z-10">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 19c-2.3 0-6.4-.2-8.1-.6-.7-.2-1.2-.7-1.4-1.4-.3-1.1-.5-3.4-.5-5s.2-3.9.5-5c.2-.7.7-1.2 1.4-1.4C5.6 5.2 9.7 5 12 5s6.4.2 8.1.6c.7.2 1.2.7 1.4 1.4.3 1.1.5 3.4.5 5s-.2 3.9-.5 5c-.2.7-.7 1.2-1.4 1.4-1.7.4-5.8.6-8.1.6 0 0 0 0 0 0z" />
                            <path d="M12 5v14" />
                            <path d="M5 8h14" />
                            <path d="M5 16h14" />
                          </svg>
                        </span>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <SelectTrigger className="pl-10 pr-4 py-2 border border-secondary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary">
                            <SelectValue placeholder="Select reading level" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="preschool">Preschool (Ages 3-4)</SelectItem>
                            <SelectItem value="kindergarten">Kindergarten (Ages 5-6)</SelectItem>
                            <SelectItem value="early-elementary">Early Elementary (Ages 6-8)</SelectItem>
                            <SelectItem value="late-elementary">Late Elementary (Ages 9-12)</SelectItem>
                            <SelectItem value="middle-school">Middle School (Ages 12-14)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </FormControl>
                    <FormDescription>
                      Select the appropriate reading level for the story.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Story Length */}
            {showStoryLength && (
              <FormField
                control={form.control}
                name="storyLength"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Story Length</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-secondary z-10">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                          </svg>
                        </span>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <SelectTrigger className="pl-10 pr-4 py-2 border border-secondary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary">
                            <SelectValue placeholder="Select story length" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="very-short">Very Short (2-4 minutes)</SelectItem>
                            <SelectItem value="short">Short (5-7 minutes)</SelectItem>
                            <SelectItem value="medium">Medium (8-12 minutes)</SelectItem>
                            <SelectItem value="long">Long (13-20 minutes)</SelectItem>
                            <SelectItem value="extended">Extended (20+ minutes)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </FormControl>
                    <FormDescription>
                      Select the desired length for the story.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="rounded-xl overflow-hidden mt-6">
              <Button 
                type="submit" 
                className={`w-full py-4 px-4 ${formType === "historical" ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600" : "bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90"} text-white font-medium rounded-xl shadow-lg transition duration-200 flex items-center justify-center`}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating Your Story...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-sparkles mr-2">
                      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                      <path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" />
                    </svg> 
                    {formType === "historical" ? "Create Historical Story" : 
                      form.watch("storyType") === "poem" ? "Create Bedtime Poem" : 
                      form.watch("storyType") === "moral" ? "Create Moral Bedtime Story" : 
                      form.watch("storyType") === "biblical_narrative" ? "Create Biblical Narrative" :
                      "Create Bedtime Story"}
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}