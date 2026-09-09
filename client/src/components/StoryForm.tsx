import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn, queryClient } from "@/lib/queryClient";
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
import {
  StoryRequest,
  storyRequestSchema,
  MAX_STORY_CHARACTERS,
  characterIdsOf,
  type Character,
} from "@shared/schema";
import CharacterPicker from "@/components/CharacterPicker";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AnimalAutocomplete from "./AnimalAutocomplete";
import HeroPicker from "./HeroPicker";
import type { HeroOfFaith } from "@shared/schema";
import CharacterForm from "./CharacterForm";
import PromptEditor from "./PromptEditor";

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
  /**
   * Characters carried over from a story being continued. Removing one of these
   * asks for confirmation -- they are here because they were in the last story,
   * not because the user picked them this time.
   */
  inheritedCharacterIds?: string[];
  /** Title of the story being continued, for the confirmation copy. */
  parentStoryTitle?: string;
  /**
   * This story continues another. Implies the series flag without the box, and
   * makes the cliffhanger option always available -- a story in a series is
   * exactly where "not over yet" is a real choice.
   */
  isContinuation?: boolean;
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
  showCustomCharacter = true,
  inheritedCharacterIds = [],
  parentStoryTitle,
  isContinuation = false,
}: StoryFormProps) {
  const [useTimeTravel, setUseTimeTravel] = useState(false);
  const [hasSelectedBiblicalEvent, setHasSelectedBiblicalEvent] = useState(false);
  const [hasSelectedHeroOfFaith, setHasSelectedHeroOfFaith] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | undefined>();
  
  // handleEditCharacter() used to live here. It read form.getValues("characterId")
  // to work out which of the one selected characters to edit; with a cast the
  // chip knows which one it is and passes it, so there is nothing left to look up.

  // Function to handle character update completion
  const handleCharacterUpdated = (updatedCharacterData: any) => {
    setEditDialogOpen(false);
    setSelectedCharacter(undefined);
    // Refresh characters list to show updated character
    queryClient.invalidateQueries({ queryKey: ['/api/characters'] });
  };
  
  // Fetch characters for selection - always fetch them as they can be used in any story type
  const { data: characters = [], isLoading: charactersLoading } = useQuery<Character[]>({
    queryKey: ['/api/characters'],
    queryFn: getQueryFn<Character[]>({
      on401: "throw"
    }),
    // Always fetch characters as they can be used in any story type
    enabled: true,
  });
  
  // HeroPicker owns the SEARCH over heroes; this reads the same cached list
  // (same query key, so no second request) purely to offer the selected hero's
  // key events as focus options.
  
  // Which model will write this story. Needed only so the accuracy note below
  // can be honest: the factual anchors ship with the app and help every model,
  // but a free-typed passage has no anchor, and that gap is much wider on a 20B
  // local model than on gpt-4o.
  const { data: modelSetting } = useQuery<{ model: string; tier: string }>({
    queryKey: ['/api/settings/openai-model'],
    queryFn: getQueryFn<{ model: string; tier: string }>({ on401: "returnNull" }),
  });
  const usingLocalModel = modelSetting?.tier === "local";

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
      // Both tabs default to "regular". The historical tab is distinguished by
      // the fields it shows -- Biblical Event, Hero of Faith, Bible Passage,
      // Learning Focus -- not by a story type that told the model to be
      // faithful to a text nobody supplied.
      storyType: "regular" as const,
      useTimeTravel: false,
      characterIds: [],
      customPrompt: "", // Empty custom prompt by default
      biblePassage: "", // New field for Bible passage study
      learningFocus: "", // No default learning focus
      // New fields
      readingLevel: "early-elementary", // Default reading level
      storyLength: "medium", // Default story length
      useCharacter: false, // Default to not using custom character
      // Custom prompts for Parent Mode
      customSystemPrompt: "",
      customUserPrompt: "",
      useCustomPrompts: false,
      characterDetails: {
        age: 8,
        hair: "",
        eyes: "",
        favoriteColor: "",
        personality: "",
        hobby: "",
        favoriteAnimal: ""
      },
    },
  });

  /**
   * The chosen hero's key events, which are the focus options.
   *
   * Shares HeroPicker's query key, so the list is fetched once and this costs
   * nothing. heroOfFaith holds an id, but resolveHeroOfFaith accepts an id OR a
   * name, and a story loaded from localStorage can carry either -- so match on
   * both rather than assume.
   */
  const { data: allHeroes = [] } = useQuery<HeroOfFaith[]>({ queryKey: ["/api/heroes"] });
  const watchedHero = form.watch("heroOfFaith");
  const selectedHeroEvents =
    (watchedHero && watchedHero !== "none"
      ? allHeroes.find((h) => h.id === watchedHero || h.name === watchedHero)?.keyEvents
      : undefined) ?? [];

  
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

  /**
   * Seed the cast from the story being continued -- ONCE.
   *
   * Guarded twice on purpose. seededRef stops a re-render from re-applying it,
   * and dirtyFields stops the slow half of a race: the parent story is fetched
   * over the network, so without this a user who picks their cast quickly would
   * watch it be replaced by the inherited one when the request landed.
   */
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || inheritedCharacterIds.length === 0) return;
    if (form.formState.dirtyFields.characterIds) return;
    seededRef.current = true;
    form.setValue("characterIds", inheritedCharacterIds);
  }, [inheritedCharacterIds, form]);

  // Update the form when the time travel checkbox or biblical narrative option changes
  useEffect(() => {
    form.setValue("useTimeTravel", useTimeTravel);
    
    if (formType === "historical") {
      // In historical mode, child's name, gender, and animal are not needed
      form.clearErrors(['childName', 'gender', 'animal']);
      
      // The childName: "Biblical Character" write that used to be here is GONE.
      // It existed only to satisfy the old refine, went into the prompt as a
      // protagonist, and PLACEHOLDER_NAMES had to strip it out again. The refine
      // now accepts a biblical event or a hero on its own, so there is nothing
      // to work around.
      form.setValue("animal", "");
      
      // Keep character selection even for historical mode
      // Character selection remains optional; don't clear it
      form.setValue("useTimeTravel", false);
      
    } 
    else if (useTimeTravel) {
      // In time travel mode the chosen characters carry name, gender and animal.
      form.clearErrors(['childName', 'gender', 'animal']);
      form.setValue("animal", "");

      // The childName: "Character" write that used to be here is GONE. It only
      // ever existed to satisfy childName.min(1) while the field was hidden,
      // and it went straight into the prompt as a protagonist -- which is the
      // entire reason PLACEHOLDER_NAMES exists to strip it back out. The refine
      // accepts a non-empty cast now, so the workaround has no job.
      //
      // The focus hack that followed is gone with it: it queried
      // [name="characterId"], a control the picker does not render.
    } 
    // Keep character selection even when time travel is not enabled
    // This allows using the character in regular stories too
  }, [useTimeTravel, form, formType]);

  // Character creation is now handled exclusively through the Character tab

  return (
    <>
    <Card className={`content-container rounded-2xl shadow-lg ${formType === "historical" ? "border-warning" : "border-border"}`}>
      <CardContent className="p-6">
        {/* Only show child fields when needed */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Said once, up front. Before this the ONLY signal about what was
                required was the refine's error message, which appears after
                you press the button -- and on the historical tab, where nothing
                is required at all, there was no signal in either direction. */}
            <p className="text-sm text-muted-foreground">
              {formType === "historical"
                ? "Everything here is optional. Pick a biblical event or a hero of the faith, or just describe what you want."
                : "All you need is a character, or a name. Everything else is optional."}
            </p>

            {/* Character Selection - Moved to the top and available for all story types, including biblical narratives */}
            {(formType === "children" || formType === "historical") && (
              <FormField
                control={form.control}
                name="characterIds"
                render={({ field }) => (
                  <FormItem className="mb-4">
                    <FormLabel className="text-sm font-medium">
                      Characters
                      {formType === "historical" && (
                        <span className="ml-2 font-normal text-muted-foreground">(optional)</span>
                      )}
                    </FormLabel>
                    <FormControl>
                      <CharacterPicker
                        value={field.value ?? []}
                        onChange={field.onChange}
                        confirmRemoveIds={inheritedCharacterIds}
                        parentStoryTitle={parentStoryTitle}
                        onEdit={(c) => {
                          setSelectedCharacter(c);
                          setEditDialogOpen(true);
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      {formType === "historical"
                        ? "A historical or biblical story does not need a character. Add one only if you want somebody to witness the account, or to be written into it."
                        : `Saved characters, reusable across stories. Up to ${MAX_STORY_CHARACTERS}; the first one is the main character.`}
                    </FormDescription>
                    {/* Always, not only when the list is empty. The picker is
                        the door to persistent characters, and a user with two
                        saved has no other signal that more can be made. */}
                    <p className="text-xs text-muted-foreground">
                      {characters.length === 0
                        ? "You have no saved characters yet — "
                        : "Want another? "}
                      <a href="/characters" className="font-medium text-secondary underline">
                        {characters.length === 0 ? "create one" : "manage your characters"}
                      </a>
                      .
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* form.watch(), not form.getValues(). getValues does not subscribe, so
                this gate was one render stale: picking a character left the name
                and gender fields on screen until something else re-rendered the
                form. With a cast it would be wrong more often, because the
                selection changes more often. */}
            {/* QUICK CHARACTER -- a one-off protagonist, for a story you do not
                want to save anyone for.
                
                Bracketed so it reads as an ALTERNATIVE to the picker above
                rather than as three more fields to fill in. The two are
                mutually exclusive by construction: this whole block disappears
                the moment a saved character is chosen, which is what the gate
                below does. Loose in the form, as it was, it looked like part of
                the same question and there was nothing to say that a name typed
                here is thrown away when the story is written. */}
            {formType === "children" && showChildFields && characterIdsOf(form.watch()).length === 0 && (
              <div className="space-y-4 rounded-lg border border-border bg-muted/40 p-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">Quick Character</h3>
                  <p className="text-xs text-muted-foreground">
                    For a one-off story. Nothing here is kept — to reuse someone
                    across stories, create them on the{" "}
                    <a href="/characters" className="font-medium text-secondary underline">
                      Characters page
                    </a>{" "}
                    and pick them above.
                  </p>
                </div>
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
                      <FormLabel className="text-sm font-medium">
                        Favorite Animal
                        <span className="ml-2 font-normal text-muted-foreground">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <AnimalAutocomplete
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Type any animal name or leave empty for none"
                          allowNone={true}
                        />
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
              </div>
            )}
            
            {formType === "children" && (
              <FormField
                control={form.control}
                name="theme"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Theme/Message
                      <span className="ml-2 font-normal text-muted-foreground">(optional)</span>
                    </FormLabel>
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

            {/* What actually happens in the story.
                Deliberately prominent, and placed next to Theme because these
                two together decide what the story is about. This field already
                existed and was already un-gated -- it just sat two-thirds of the
                way down a flat 900-line form, styled like every other optional
                dropdown, labelled "Custom Story Request (Optional)", where
                nobody found it.

                It is NOT the Parent Mode prompt editor further down. That one
                REPLACES the storyteller's persona and is correctly gated. This
                one only adds to the brief. */}
            <FormField
              control={form.control}
              name="customPrompt"
              render={({ field }) => (
                <FormItem className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
                  <FormLabel className="text-base font-semibold text-secondary">
                    What should happen in this story?
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </FormLabel>
                  <FormDescription className="mb-2">
                    The best way to get a story that feels like yours rather than
                    a generic one. Describe a situation, a problem, or something
                    that happened this week.
                  </FormDescription>
                  <FormControl>
                    <Textarea
                      placeholder="e.g. She was frightened of the thunderstorm last night and hid under the table. I'd like a story about being brave when you're scared."
                      className="min-h-28 bg-card border border-secondary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
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
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <SelectTrigger className="pl-10 pr-4 py-2 border border-secondary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary">
                            <SelectValue placeholder="Select story type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="regular">Regular Story</SelectItem>
                            <SelectItem value="poem">Poem</SelectItem>
                            <SelectItem value="moral">Moral Story</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            {formType === "children" && showTimeTravel && (
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

            {/* SERIES. Two related choices, boxed together because they are one
                decision: is this story the end of something, or the start.
                
                mayContinue is what buys the extraction call that lets a later
                story know who appeared and what is now true, so it is opt-in --
                a one-off story should not pay for it. A CONTINUATION implies it
                without the box, which is why the box hides itself there. */}
            <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
              <h3 className="text-sm font-semibold">Part of a series?</h3>

              {isContinuation ? (
                <p className="text-xs text-muted-foreground">
                  This story continues an earlier one, so what happens in it will
                  be remembered for the next one automatically.
                </p>
              ) : (
                <FormField
                  control={form.control}
                  name="mayContinue"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="text-sm font-medium">
                          I might write more stories in this world
                        </FormLabel>
                        <FormDescription className="text-xs">
                          Keeps track of who appeared and what happened, so a later
                          story stays true to this one. Costs one extra request when
                          the story is finished.
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              )}

              {(isContinuation || form.watch("mayContinue")) && (
                <FormField
                  control={form.control}
                  name="cliffhanger"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="text-sm font-medium">
                          Leave it on a cliffhanger
                        </FormLabel>
                        <FormDescription className="text-xs">
                          End without resolving it, so the next story picks it up.
                          The scene still finishes properly.
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              )}
            </div>

            
            {/* Character selection has been moved to the top of the form */}
            
            {formType === "historical" && (
              <div className={`rounded-lg border p-3 text-xs ${usingLocalModel ? "border-warning bg-warning-surface text-warning" : "border-secondary/20 bg-secondary/5 text-secondary/90"}`}>
                <p className="font-medium mb-1">
                  {usingLocalModel ? "Accuracy on the local model" : "About accuracy"}
                </p>
                <p>
                  Lion Tails ships the actual account -- what happens, in order, with the real
                  names, and a verbatim key verse -- for every <strong>Biblical Event</strong> and
                  every <strong>Hero of the Faith</strong> in the lists below, so the AI is
                  retelling rather than remembering.
                </p>
                <p className="mt-1">
                  A <strong>Bible Passage</strong> you type yourself has no such anchor: the AI is
                  working from memory{usingLocalModel ? ", and the local model's memory of Scripture is unreliable. For a passage that is not in the list, switch to a cloud model in Settings, or check the result before reading it aloud." : ". Check the result before reading it aloud."}
                </p>
              </div>
            )}

            {showBiblicalEvent && formType === "historical" && (
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
                      <div>
                        {/* Was a plain Select. At forty-one heroes -- and
                            roughly double once the biblical characters land --
                            an alphabetical scroll list is not a way to find
                            anybody. This searches names, eras, places and the
                            biography text, so a parent who wants a story about
                            someone brave can type "martyr" instead of needing
                            the name first. */}
                        <HeroPicker
                          value={field.value === "none" ? "" : field.value || ""}
                          onChange={(heroId) => {
                            field.onChange(heroId);
                            setHasSelectedHeroOfFaith(Boolean(heroId));
                            // Choosing a hero clears a biblical event: the form
                            // allows one or the other, not both.
                            if (heroId && formType === "historical") {
                              form.setValue("biblicalEvent", "");
                              setHasSelectedBiblicalEvent(false);
                            }
                          }}
                          disabled={formType === "historical" && hasSelectedBiblicalEvent}
                        />
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

            {/* WHICH PART of that life. A Hero of Faith is a whole life, and
                asked for "a story about Corrie ten Boom" a model returns a
                summary of all of it. One episode told properly is a better
                story and teaches more.
                
                The options are the hero's own keyEvents, which every hero
                already carries and /api/heroes already returns -- so this costs
                no model call and no new content. */}
            {selectedHeroEvents.length > 0 && (
              <FormField
                control={form.control}
                name="storyFocus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      What part of their life?
                    </FormLabel>
                    <FormControl>
                      <Select
                        value={
                          field.value?.mode === "surprise"
                            ? "__surprise__"
                            : field.value?.mode === "chosen"
                              ? field.value.text
                              : "__whole__"
                        }
                        onValueChange={(v) => {
                          if (v === "__whole__") field.onChange({ mode: "whole", text: "" });
                          else if (v === "__surprise__") field.onChange({ mode: "surprise", text: "" });
                          else {
                            const e = selectedHeroEvents.find((k) => k.description === v);
                            field.onChange({
                              mode: "chosen",
                              text: v,
                              reference: e?.reference || e?.year || undefined,
                            });
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Their whole life" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__whole__">Their whole life</SelectItem>
                          <SelectItem value="__surprise__">
                            Surprise me — pick a moment for me
                          </SelectItem>
                          {selectedHeroEvents.map((e, i) => (
                            <SelectItem key={i} value={e.description}>
                              {e.year || e.reference ? `${e.year || e.reference} — ` : ""}
                              {e.description}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormDescription>
                      One episode, told properly, beats a summary of a whole
                      life. "Surprise me" picks one when the story is written.
                    </FormDescription>
                    <FormMessage />
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

            {/* Prompt Editor for Parent Mode */}
            <div className="mt-6">
              <PromptEditor
                storyRequest={form.watch()}
                onPromptsChanged={(systemPrompt, userPrompt) => {
                  form.setValue("customSystemPrompt", systemPrompt);
                  form.setValue("customUserPrompt", userPrompt);
                  form.setValue("useCustomPrompts", true);
                }}
              />
            </div>

            <div className="rounded-xl overflow-hidden mt-6">
              <Button 
                type="submit" 
                className={`w-full py-4 px-4 ${formType === "historical" ? "bg-warning hover:bg-warning/90" : "bg-primary hover:bg-primary/90"} text-primary-foreground font-medium rounded-xl shadow-lg transition duration-200 flex items-center justify-center`}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
                      form.watch("storyType") === "poem" ? "Create Poem" :
                      form.watch("storyType") === "moral" ? "Create Moral Story" :
                      "Create Story"}
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>

    {/* Character Edit Dialog */}
    <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Character</DialogTitle>
        </DialogHeader>
        {selectedCharacter && (
          <CharacterForm
            initialCharacter={selectedCharacter}
            onSubmit={handleCharacterUpdated}
            loading={false}
          />
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}