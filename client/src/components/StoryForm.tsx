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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  StoryRequest,
  storyRequestSchema,
  MAX_STORY_CHARACTERS,
  characterIdsOf,
  type Character,
  type CharacterRole,
  MAX_STUDY_QUESTIONS,
  isChosen,
} from "@shared/schema";
import { Switch } from "@/components/ui/switch";
import CharacterPicker from "@/components/CharacterPicker";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AnimalAutocomplete from "./AnimalAutocomplete";
import SourcePicker, { type StorySource } from "./SourcePicker";
import type { HeroOfFaith } from "@shared/schema";
import CharacterForm, { type CharacterFormValues } from "./CharacterForm";
import { saveCharacter } from "@/lib/saveCharacter";
import { useToast } from "@/hooks/use-toast";
import PromptEditor from "./PromptEditor";
import { ROLE_OPTIONS } from "@/lib/characterRole";
import { QUEST_SERIES_TITLE } from "@shared/quests";

/**
 * The radio itself, so neither tab owns the markup.
 *
 * Takes value and onChange rather than a react-hook-form field object, so it
 * cannot silently accept the wrong controller.
 */
function RoleChoices({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  options: CharacterRole[];
  /** Visible but not yet enabled: a real disabled, on the group and each item. */
  disabled?: boolean;
}) {
  return (
    <RadioGroup
      onValueChange={onChange}
      value={value ?? options[0]}
      className="space-y-2"
      disabled={disabled}
    >
      {options.map((key) => (
        <FormItem key={key} className="flex items-start space-x-3 space-y-0">
          <FormControl>
            <RadioGroupItem value={key} className="mt-1" disabled={disabled} />
          </FormControl>
          <div className="space-y-1 leading-none">
            <FormLabel className="font-medium">{ROLE_OPTIONS[key].label}</FormLabel>
            <FormDescription>{ROLE_OPTIONS[key].description}</FormDescription>
          </div>
        </FormItem>
      ))}
    </RadioGroup>
  );
}

/**
 * Starters, offered because a blank box is the problem this tab has.
 *
 * The complaint that produced this feature was that the historical tab
 * demanded knowledge the reader may not have; asking them to compose questions
 * about an account they have not read yet demands exactly that. These are
 * generic on purpose -- they work against any event, person or passage, and
 * they are the questions worth asking about all of them.
 */
const SUGGESTED_QUESTIONS = [
  "What was it actually like to be there?",
  "What does the text not tell us?",
  "Why did they do it that way?",
  "What do people get wrong about this?",
];

interface StoryFormProps {
  onSubmit: (data: StoryRequest) => void;
  loading?: boolean;
  formType?: "original" | "historical";
  showChildFields?: boolean;
  showAnimalToggle?: boolean;
  showHeroOfFaith?: boolean;
  showHistoricalAccuracyToggle?: boolean;
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
  /** A hero chosen on the Heroes page, already consumed by the tabs above. */
  handedOverHeroId?: string;
  /**
   * The universe this story is being added to. Like a continuation for the
   * series block: the world will remember it, so there is no box to tick.
   */
  universeName?: string;
}

export default function StoryForm({ 
  onSubmit, 
  loading = false,
  formType = "original",
  showChildFields = true,
  showAnimalToggle = true,
  showHeroOfFaith = true,
  showHistoricalAccuracyToggle = false,
  showReadingLevel = true,
  showStoryLength = true,
  showCustomCharacter = true,
  inheritedCharacterIds = [],
  parentStoryTitle,
  isContinuation = false,
  handedOverHeroId,
  universeName,
}: StoryFormProps) {
  const { toast } = useToast();
  /**
   * Is a hero of faith being brought into this story at all?
   *
   * Local rather than a form field because it is not a fact about the story --
   * it is the question that reveals the two that are. What it gates writes
   * heroOfFaith and characterRole, and those are what get frozen.
   */
  const [bringInHero, setBringInHero] = useState(false);
  /**
   * The questions, as typed. One per line.
   *
   * Local state backing a textarea, split into the array the request carries
   * on every change -- rather than the array being edited directly, which
   * would mean a list editor with add and remove buttons to type three
   * sentences into.
   */
  const [questionText, setQuestionText] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | undefined>();
  
  // handleEditCharacter() used to live here. It read form.getValues("characterId")
  // to work out which of the one selected characters to edit; with a cast the
  // chip knows which one it is and passes it, so there is nothing left to look up.

  /**
   * Save an edit made from the story form.
   *
   * This used to take the edited values, ignore them, close the dialog and
   * invalidate the query -- so the list refetched, showed the unchanged
   * character, and the edit was gone with no error anywhere. It looked exactly
   * like a save that had worked.
   */
  const handleCharacterUpdated = async (values: CharacterFormValues, custom: boolean) => {
    if (!selectedCharacter) return;
    try {
      await saveCharacter(values, custom, selectedCharacter.id);
      setEditDialogOpen(false);
      setSelectedCharacter(undefined);
      queryClient.invalidateQueries({ queryKey: ['/api/characters'] });
    } catch (error) {
      toast({
        title: "Could not save that character",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    }
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
  /**
   * A hero handed over from the Heroes page.
   *
   * A PROP now, read once by the tabs component above. It used to be read here
   * with a bare localStorage.getItem at render time -- by BOTH tabs' forms,
   * each of which then removed the key, so whichever mounted first destroyed it
   * for the other. That was always the original tab's, and once its picker went
   * behind a switch the hero landed in a control nobody could see.
   */
  const selectedHeroFromStorage = handedOverHeroId ?? null;
  
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
      // useTimeTravel is not defaulted here on purpose. It is legacy, nothing
      // writes it any more, and the schema's own .default(false) covers a
      // request that omits it. Listing it invited exactly the bug above:
      // somewhere to set a flag that no longer decides anything.
      /**
       * Empty on both tabs, and on the historical tab it STAYS empty: no
       * control there can add to it.
       *
       * Set here rather than force-written by an effect. An effect that
       * rewrites a field on every render is exactly how useTimeTravel came to
       * be written into a field nothing read -- and it would race the
       * continuation seeding above, where whichever landed last would win
       * permanently.
       */
      characterIds: [],
      // "absent" is the safe default: a retelling is about the person it is
      // about, and getting it wrong this way gives a plainer story rather than
      // a child written into Scripture.
      characterRole: "absent" as const,
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
      // NO characterDetails DEFAULT. It used to be {age: 8, ...}, no field on
      // the form ever rendered it, and nothing stripped it -- so every request
      // carried it, and buildStoryBrief read the age from it whenever no saved
      // character was chosen. Every "just type a name" story in the library was
      // written about an eight-year-old nobody specified.
      //
      // The golden fixture could not see it: its base request omits
      // characterDetails entirely, so the test asserted a prompt the form never
      // actually sent. There is a case built from these defaults now.
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

  
  /**
   * hasSelectedBiblicalEvent and hasSelectedHeroOfFaith used to live here, with
   * an effect keeping them and the form in step.
   *
   * They were React state MIRRORING form values -- not derived from them -- so
   * they could disagree with the form, and the mutual exclusion they enforced
   * was one-directional anyway: picking an event disabled the hero picker;
   * picking a hero disabled nothing. The single source control has no second
   * copy of the answer to keep in step.
   */

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
    // Never on the historical tab, which has no cast at all. Seeding one there
    // would put characters on a request whose form cannot show or remove them,
    // and "Continue this story" reaches both tabs.
    if (formType === "historical") return;
    if (seededRef.current || inheritedCharacterIds.length === 0) return;
    if (form.formState.dirtyFields.characterIds) return;
    seededRef.current = true;
    form.setValue("characterIds", inheritedCharacterIds);
  }, [inheritedCharacterIds, form, formType]);

  /**
   * Clear the fields the chosen cast makes unnecessary.
   *
   * The `form.setValue("useTimeTravel", ...)` writes that used to open and
   * close this effect are GONE, and they were worse than redundant. The form
   * defaults characterRole to "absent" and characterRoleOf gives the explicit
   * field precedence over the legacy flag -- so the checkbox that set this
   * wrote true into a field nothing read, the request still said "absent", the
   * character was scrubbed from the brief, and ticking "Time Travel Adventure"
   * produced a plain retelling. It looked like a working control for as long
   * as characterRole has existed.
   */
  useEffect(() => {
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
    } 
    else if (bringInHero) {
      // With a hero in the story the chosen characters carry name, gender and
      // animal.
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
  }, [bringInHero, form, formType]);

  /**
   * ONE choice, three frozen fields.
   *
   * biblicalEvent, heroOfFaith and biblePassage are three columns of one
   * decision, kept apart only because thousands of requests already carry them
   * and jsonb is never rewritten. Read and written here and nowhere else, so
   * no handler can set one without clearing the others -- which is precisely
   * how a hero came to be silently dropped from a prompt.
   */
  const watched = form.watch();
  const source: StorySource = isChosen(watched.biblicalEvent)
    ? { kind: "event", id: watched.biblicalEvent! }
    : isChosen(watched.heroOfFaith)
      ? { kind: "hero", id: watched.heroOfFaith! }
      : isChosen(watched.biblePassage)
        ? { kind: "passage", text: watched.biblePassage! }
        : null;

  const writeSource = (next: StorySource) => {
    form.setValue("biblicalEvent", next?.kind === "event" ? next.id : "");
    form.setValue("heroOfFaith", next?.kind === "hero" ? next.id : "");
    form.setValue("biblePassage", next?.kind === "passage" ? next.text : "");
    // The episode select is populated from a hero's own key events, so a focus
    // chosen for one source is meaningless against another. The server clears
    // this too; doing it here as well is what stops the FORM lying about it.
    if (next?.kind !== "hero") form.setValue("storyFocus", undefined);
  };

  const writeQuestions = (text: string) => {
    setQuestionText(text);
    form.setValue(
      "studyQuestions",
      text
        .split("\n")
        .map((q) => q.trim())
        .filter(Boolean)
        .slice(0, MAX_STUDY_QUESTIONS),
    );
  };

  /**
   * Say something when the form refuses to submit.
   *
   * There was no onInvalid at all, and the schema's single refine attaches its
   * message to `characterIds` -- a control the historical tab no longer
   * renders. So an empty historical form met "Create Historical Story" with
   * nothing: no error, no message, no movement. The refine's own comment warns
   * about exactly this ("must name the field the FORM renders, or the error
   * attaches to a control that no longer exists and the user sees nothing"),
   * and taking the cast off this tab is what made it true again.
   *
   * A toast rather than a better path, because there is no single field to
   * blame: the rule is about the request as a whole.
   */
  const onInvalid = (errors: Record<string, unknown>) => {
    const first = Object.values(errors).find(
      (e): e is { message?: string } => typeof e === "object" && e !== null,
    );
    toast({
      title: "Not quite ready",
      description:
        first?.message ||
        (formType === "historical"
          ? "Pick something to dig into first -- an event, a person, or a passage."
          : "Add a character, or give a name and gender."),
      variant: "destructive",
    });
  };

  // Character creation is now handled exclusively through the Character tab

  return (
    <>
    <Card className={`content-container rounded-2xl shadow-lg ${formType === "historical" ? "border-warning" : "border-border"}`}>
      <CardContent className="p-6">
        {/* Only show child fields when needed */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">
            {/* Said once, up front. Before this the ONLY signal about what was
                required was the refine's error message, which appears after
                you press the button -- and on the historical tab, where nothing
                is required at all, there was no signal in either direction. */}
            <p className="text-sm text-muted-foreground">
              {formType === "historical"
                ? "Pick one thing to dig into -- an event, someone who really lived, or a passage -- then ask whatever you want to know about it."
                : "All you need is a character, or a name. Everything else is optional."}
            </p>

            {/* THE CAST -- and it belongs to ONE tab now.
                
                A character attached to a real account was the ambiguity this
                whole form kept tripping over: a story about Caleb came back
                with a child called Esther standing in the wilderness of Paran,
                and because her name is itself a figure in Scripture it read as
                the app confusing two people. It was not -- the account was
                accurate throughout. She had simply been put inside it.
                
                The answer is not a better question about how she appears. It is
                that the two tabs mean two different things: this one is a story
                about YOUR character, optionally set somewhere real; the other
                is the real thing itself, and nobody is written into it. */}
            {formType === "original" && (
              <FormField
                control={form.control}
                name="characterIds"
                render={({ field }) => (
                  <FormItem className="mb-4">
                    <FormLabel className="text-sm font-medium">Characters</FormLabel>
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
                      {`Saved characters, reusable across stories. Up to ${MAX_STORY_CHARACTERS}; the first one is the main character.`}
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
            {formType === "original" && showChildFields && characterIdsOf(form.watch()).length === 0 && (
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
                      <FormLabel className="text-sm font-medium">Name</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-secondary">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-user-round">
                              <circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 1 0-16 0" />
                            </svg>
                          </span>
                          <Input 
                            placeholder="Who is this story about?" 
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
                      <FormLabel className="text-sm font-medium">Boy or girl</FormLabel>
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
            
            {formType === "original" && (
              <FormField
                control={form.control}
                name="theme"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Virtue to learn
                      <span className="ml-2 font-normal text-muted-foreground">(optional)</span>
                    </FormLabel>
                    {/*
                      Says what the choice DOES, which was invisible: the theme
                      is what a finished story records as a virtue on everyone
                      who was in it, and that is the whole Virtues tab. Called a
                      theme, it read as a tone setting.
                    */}
                    <FormDescription className="text-xs">
                      Whatever you choose here is added to every character in the
                      story as a virtue they have learned, once it is finished.
                    </FormDescription>
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

            {/* ONE free-text box per tab, and they mean different things.
                
                This one steers the STORY, and it is the strongest channel in
                the whole prompt -- rendered last, under "WHAT THE USER ASKED
                FOR SPECIFICALLY". The historical tab has "What do you want to
                know?" instead, which steers the answers rather than the story.
                Two free-text boxes on one form was most of the confusion this
                change is here to remove, and "what should happen in this
                story?" is an odd question to ask about an account where what
                happens is what happened.

                It is also deliberately prominent. It already existed and was
                already un-gated -- it just sat two-thirds of the way down a
                flat 900-line form, styled like every other optional dropdown,
                labelled "Custom Story Request (Optional)", where nobody found
                it.

                It is NOT the Parent Mode prompt editor further down. That one
                REPLACES the storyteller's persona and is correctly gated. This
                one only adds to the brief. */}
            {formType === "original" && (
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
            )}
            
            {formType === "original" && (
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
              ) : universeName ? (
                <p className="text-xs text-muted-foreground">
                  This story joins <strong>{universeName}</strong>, so what happens
                  in it will be remembered there.
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

              {(isContinuation || universeName || form.watch("mayContinue")) && (
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
                {/* Keyed on WHICH KIND was chosen rather than on the tab. The
                    difference that matters is whether the app supplied the
                    account or the model is remembering it, and only the source
                    knows that. */}
                {source?.kind === "passage" ? (
                  <p>
                    A passage you type yourself has no anchor in Lion Tails: the AI is working
                    from memory{usingLocalModel ? ", and the local model's memory of Scripture is unreliable. Switch to a cloud model in Settings, or check the result before reading it aloud." : ". Check the result before reading it aloud."}
                  </p>
                ) : (
                  <p>
                    Lion Tails ships the actual account -- what happens, in order, with the real
                    names, and a verbatim key verse -- for every event and every person you can
                    pick from the list, so the AI is retelling rather than remembering. A passage
                    you type yourself has no such anchor.
                  </p>
                )}
              </div>
            )}

            {/* THE ONE THING THIS STORY IS ABOUT.

                Three fields used to live here -- Biblical Event, Heroes of the
                Faith, Bible Passage to Study -- of which only one may be used,
                which is not something three stacked fields say. Combining them
                also did things silently: an event beside a hero dropped the
                hero's whole biography from the prompt, and a passage typed
                beside a hero flipped the story onto the Scripture-retelling
                persona while the brief still described that person's life.
                resolveStorySource() settles any request that arrives; this
                makes the question unaskable.

                On the original tab it sits inside the gate above, because there
                it is optional. Here it is the point of the tab. */}
            {formType === "historical" && (
              <FormItem>
                <FormLabel className="text-sm font-medium">
                  What do you want to dig into?
                </FormLabel>
                <FormControl>
                  <SourcePicker value={source} onChange={writeSource} />
                </FormControl>
                <FormDescription>
                  An event, someone who really lived, or a passage. One of the
                  three &mdash; they are different ways in, not ingredients.
                </FormDescription>
              </FormItem>
            )}

            {/* WHAT THEY WANT TO KNOW.

                This replaces a "Learning Focus" Select of seven slugs that had
                no description saying what any of them meant and whose value
                reached the model unrendered -- the prompt literally read
                "Learning focus: theological-significance."

                Suggested questions matter more than the box. The complaint
                that started this was that the tab demanded knowledge the user
                may not have; a blank box asking for questions about an account
                you have not read yet demands exactly that. */}
            {formType === "historical" && source && (
              <FormItem>
                <FormLabel className="text-sm font-medium">
                  What do you want to know? <span className="text-muted-foreground font-normal">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    value={questionText}
                    onChange={(e) => writeQuestions(e.target.value)}
                    placeholder={"One question per line.\ne.g. Why did they do it that way?"}
                    className="resize-y"
                  />
                </FormControl>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {SUGGESTED_QUESTIONS.filter((q) => !questionText.includes(q)).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => writeQuestions(questionText.trim() ? `${questionText.trim()}\n${q}` : q)}
                      className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      + {q}
                    </button>
                  ))}
                </div>
                <FormDescription>
                  Answered after the story, in a section of its own, from the
                  same account it was written from. Up to {MAX_STUDY_QUESTIONS}.
                </FormDescription>
              </FormItem>
            )}

            
            {/* SET IT IN SOMETHING REAL, and the two ways in.
                
                This replaces a "Time Travel Adventure" checkbox that had not
                worked since characterRole shipped: the form defaults that field
                to "absent", characterRoleOf gives it precedence over the legacy
                flag, and so ticking the box produced a plain retelling with the
                character scrubbed out. It looked exactly like a working control.
                
                It is a gate rather than a third radio option because the two
                modes are only a question at all once there is somewhere real to
                be, and because off is the honest default -- most stories on this
                tab have nothing real in them. But a gate is not a curtain: what
                it gates is VISIBLE before it is on, greyed, so nobody has to
                flip a switch to find out the Timekeeper exists.
                
                It offers the SAME picker as the historical tab, and that is not
                an accident of reuse. Biblical events could only ever be chosen
                on the historical tab, so taking characters off that tab would
                have quietly deleted the ability to travel to one: a character
                could meet Caleb and never see the ark. The lantern exists for
                the ark. */}
            {formType === "original" && showHeroOfFaith && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    {/* Slot for the shop sign: a wide image, h-8 to h-10, on
                        the right of this eyebrow, when the file is in the repo. */}
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {QUEST_SERIES_TITLE}
                    </p>
                    <h3 className="text-sm font-semibold">Set it somewhere real</h3>
                    <p className="text-xs text-muted-foreground">
                      Put your character into an event that happened, or beside
                      somebody who really lived.
                    </p>
                  </div>
                  <Switch
                    checked={bringInHero}
                    onCheckedChange={(on) => {
                      setBringInHero(on);
                      if (on) {
                        // Switching on commits to a mode straight away, so the
                        // request never carries a source with nobody in it.
                        form.setValue("characterRole", "travels");
                      } else {
                        // And switching off clears BOTH, so a source picked and
                        // then abandoned cannot ride along on the request.
                        form.setValue("characterRole", "absent");
                        writeSource(null);
                      }
                    }}
                    aria-label="Set it somewhere real"
                  />
                </div>

                {/* ALWAYS RENDERED, greyed while off. These used to mount only
                    once the switch was on, so until then there was no sign the
                    Timekeeper existed -- and he is becoming most of what this
                    app is. A real `disabled` on each control (house style, not
                    a pointer-events wrapper), and opacity on the block so the
                    labels grey with them. The switch and heading stay at full
                    strength: the thing to press is the thing that is not grey.
                    The quest shows preselected while off because it is the
                    mode the switch commits to; disabled says it is not yet
                    what will happen. */}
                <div
                  className={bringInHero ? "space-y-3" : "space-y-3 opacity-60"}
                  aria-disabled={!bringInHero}
                >
                  <FormItem>
                    <FormLabel className="text-sm font-semibold">
                      Where, or who?
                    </FormLabel>
                    <FormControl>
                      <SourcePicker value={source} onChange={writeSource} disabled={!bringInHero} />
                    </FormControl>
                  </FormItem>

                  <FormField
                    control={form.control}
                    name="characterRole"
                    render={({ field }) => (
                      <FormItem className="space-y-3 pt-1">
                        <FormLabel className="text-sm font-semibold">
                          How does your character come to be there?
                        </FormLabel>
                        <FormControl>
                          {/* Two options, one field: they cannot both be true,
                              which is the entire reason this is not a pair of
                              checkboxes. */}
                          <RoleChoices
                            value={field.value === "absent" ? "travels" : field.value}
                            onChange={field.onChange}
                            options={["travels", "alongside"]}
                            disabled={!bringInHero}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
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
      <DialogContent className="max-w-3xl top-[4vh] translate-y-0 max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Character</DialogTitle>
        </DialogHeader>
        {selectedCharacter && (
          <CharacterForm
            initialCharacter={selectedCharacter}
            saved={selectedCharacter}
            onSubmit={handleCharacterUpdated}
            loading={false}
          />
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}