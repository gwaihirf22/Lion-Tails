import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Pencil, Search, Undo2 } from "lucide-react";
import {
  characterSchema,
  baseStats,
  statsOf,
  pointsEarned,
  pointsSpent,
  CHARACTER_STATS,
  STAT_BASE,
  STAT_FLOOR,
  STAT_CAP,
  STARTING_POINTS,
  virtueLevels,
  type Character,
  type CharacterStat,
} from "@shared/schema";
import {
  CHARACTER_CATEGORIES,
  categoryOf,
  coveringNoun,
  optionsFor,
  popularKinds,
  randomName,
  searchKinds,
  type CharacterCategory,
  type VocabField,
} from "@shared/characterVocab";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import CharacterAvatar from "./CharacterAvatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequestAllowingErrors } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useParentMode } from "@/hooks/use-parent-mode";
import AnimalAutocomplete from "./AnimalAutocomplete";

/**
 * Making a character.
 *
 * ONE component, not a basic one and an advanced one. Two would be two field
 * lists, and the second would fall behind the first -- which is the failure
 * this repo names most often.
 *
 * Three rules shape it:
 *
 *  1. A CHILD SELECTS. Every descriptive control is a list from
 *     shared/characterVocab.ts, the same catalogue the server validates
 *     against. The only boxes anyone can type into are the name and the notes.
 *
 *  2. NOTHING IS DEFAULTED. The form used to open with brown hair, brown eyes,
 *     blue, reading, kind and age 8 already filled in, so every character
 *     claimed six things nobody chose and every story mentioned them. A preset
 *     writes ONE real value -- what they are -- and nothing else.
 *
 *  3. A PARENT MAY TYPE ANYTHING. In Parent Mode every field grows a pencil
 *     that swaps its list for a text box, and the save goes to the /custom
 *     route, which is the only one allowed to accept an off-catalogue value.
 */

const formSchema = characterSchema.omit({ id: true, createdAt: true, customFields: true });
export type CharacterFormValues = z.infer<typeof formSchema>;

/**
 * The eight answers that cover most characters, and a door to the other 780.
 *
 * No alien: Blake, "I don't think we want that anyway."
 */
const PRESETS: ReadonlyArray<{ kind: string; label: string }> = [
  { kind: "boy", label: "Boy" },
  { kind: "girl", label: "Girl" },
  { kind: "dog", label: "Dog" },
  { kind: "cat", label: "Cat" },
  { kind: "horse", label: "Horse" },
  { kind: "dragon", label: "Dragon" },
  { kind: "robot", label: "Robot" },
];

const CATEGORY_LABELS: Record<CharacterCategory, string> = {
  human: "People",
  mammal: "Animals",
  bird: "Birds",
  reptile: "Reptiles and dinosaurs",
  amphibian: "Frogs and newts",
  fish: "Fish",
  insect: "Bugs and spiders",
  creature: "Sea creatures",
  mythical: "Make-believe",
  machine: "Machines",
};

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Wraps one field so a parent can type into it instead of choosing.
 *
 * The pencil is the whole Parent Mode feature: whatever we failed to think of
 * goes in here. A field already holding a value the catalogue does not contain
 * opens in text mode by itself, so an edit never silently blanks it for being
 * off-list.
 */
function ParentEditable({
  active,
  value,
  onChange,
  placeholder,
  children,
}: {
  active: boolean;
  value?: string;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
  children: React.ReactNode;
}) {
  const [typing, setTyping] = useState(false);
  if (!active) return <>{children}</>;

  return (
    <div className="flex gap-2 items-start">
      <div className="flex-1">
        {typing ? (
          <Input
            autoFocus
            placeholder={placeholder}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || undefined)}
          />
        ) : (
          children
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title={typing ? "Choose from the list instead" : "Type something else"}
        onClick={() => setTyping((t) => !t)}
      >
        {typing ? <Undo2 className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
      </Button>
    </div>
  );
}

type CharacterFormProps = {
  /**
   * `custom` is true when anything was typed rather than chosen, which is what
   * sends the save to the Parent Mode route. The page decides the endpoint; the
   * form only reports how the values were arrived at.
   */
  /**
   * May return a promise. When it does, the form waits for it and then treats
   * its own values as the saved ones, which is what lets the Save button go
   * quiet without the dialog closing to prove the save happened.
   */
  onSubmit: (data: CharacterFormValues, custom: boolean) => void | Promise<unknown>;
  loading?: boolean;
  initialCharacter?: Partial<CharacterFormValues>;
  /**
   * The saved row, when editing. Carries the two things the form shows but
   * never writes -- adventures and therefore virtues, which are the server's.
   */
  saved?: Pick<Character, "adventures" | "id" | "avatarUrl">;
};

export default function CharacterForm({
  onSubmit,
  loading = false,
  initialCharacter,
  saved,
}: CharacterFormProps) {
  const { isActive: parentMode } = useParentMode();
  const [kindSearch, setKindSearch] = useState("");
  const [kindOpen, setKindOpen] = useState(false);

  const form = useForm<CharacterFormValues>({
    resolver: zodResolver(formSchema),
    // Everything empty but the name. See rule 2 above -- the previous defaults
    // are the reason every story mentioned brown hair.
    defaultValues: {
      name: initialCharacter?.name ?? "",
      kind: initialCharacter?.kind,
      category: initialCharacter?.category,
      gender: initialCharacter?.gender,
      sex: initialCharacter?.sex,
      age: initialCharacter?.age,
      hair: initialCharacter?.hair,
      eyes: initialCharacter?.eyes,
      favoriteColor: initialCharacter?.favoriteColor,
      favoriteAnimal: initialCharacter?.favoriteAnimal,
      hobby: initialCharacter?.hobby,
      personality: initialCharacter?.personality,
      notes: initialCharacter?.notes,
      mustBeTrue: initialCharacter?.mustBeTrue,
      canonicalLook: initialCharacter?.canonicalLook,
      avatarUrl: initialCharacter?.avatarUrl,
      statsEnabled: initialCharacter?.statsEnabled,
      stats: initialCharacter?.stats,
    },
  });

  const kind = form.watch("kind") ?? initialCharacter?.gender;
  const category = form.watch("category");
  const covering = coveringNoun(category, kind);

  // Stats live in form state like everything else; these are just the readouts.
  // earned comes from the SAVED row, never the form -- how many stories a
  // character has been in is not something the form gets an opinion about.
  const statValues = statsOf({ stats: form.watch("stats") });
  const earned = pointsEarned(saved);
  const available = earned + STARTING_POINTS - pointsSpent(statValues);
  const levels = virtueLevels(saved);

  const setStat = (stat: CharacterStat, value: number) => {
    if (value < STAT_FLOOR || value > STAT_CAP) return;
    form.setValue("stats", { ...statValues, [stat]: value }, { shouldDirty: true });
  };

  /** Choosing what they are also fixes which vocabulary the rest of the form offers. */
  const chooseKind = (k: string) => {
    form.setValue("kind", k, { shouldDirty: true });
    form.setValue("category", categoryOf(k), { shouldDirty: true });
    // Colour words do not survive a change of species: "blonde" is not a thing
    // a dragon's scales can be, and the server would refuse the save.
    for (const f of ["hair", "eyes"] as const) {
      const v = form.getValues(f);
      if (v && !optionsFor(f, categoryOf(k)).includes(v)) {
        form.setValue(f, undefined, { shouldDirty: true });
      }
    }
    setKindOpen(false);
    setKindSearch("");
  };

  // Suited to what they are, and never the name already in the box -- pressing
  // it twice and getting the same answer is what makes a random button feel
  // broken. The pools live beside the catalogue, not here.
  const pickRandomName = () =>
    form.setValue("name", randomName(category, form.getValues("name")), { shouldDirty: true });

  /** A value that is not in the list it came from was typed by a parent. */
  const isCustom = (values: CharacterFormValues) => {
    if (values.mustBeTrue) return true;
    if (values.kind && !categoryOf(values.kind)) return true;
    for (const f of ["hair", "eyes", "favoriteColor", "hobby", "personality"] as VocabField[]) {
      const v = values[f];
      if (v && !optionsFor(f, values.category).includes(v)) return true;
    }
    return false;
  };

  const submit = async (values: CharacterFormValues) => {
    try {
      await onSubmit(values, isCustom(values));
      // Reset TO THE SUBMITTED VALUES, not to the initial ones: this is what
      // clears isDirty, and it is why the button can grey out while the card
      // stays open. Only on success -- a failed save must stay dirty, or the
      // button goes quiet on work that was never stored.
      form.reset(values, { keepDefaultValues: false });
    } catch {
      // The parent's mutation already toasts. Swallowed here so the promise
      // rejection does not go unhandled, and so the form stays dirty.
    }
  };

  /**
   * One list-backed field, with the Parent Mode pencil already attached.
   *
   * A function that RETURNS jsx, called as vocabField(...), not a component
   * used as <VocabField/>. Declared inside the form it needs, a component gets
   * a new identity on every render, so React unmounts and remounts its subtree
   * -- which resets ParentEditable's "I am typing" state on the first
   * keystroke, and makes the pencil impossible to use.
   */
  const vocabField = (name: VocabField, label: string) => (
    <FormField
      key={name}
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <ParentEditable
            active={parentMode}
            value={field.value}
            onChange={field.onChange}
            placeholder={`Anything you like for ${label.toLowerCase()}`}
          >
            <Select onValueChange={field.onChange} value={field.value ?? ""}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {optionsFor(name, category).map((o) => (
                  <SelectItem key={o} value={o}>{title(o)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ParentEditable>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  /**
   * Ask the server to draw them.
   *
   * The allowance is NOT enforced here -- the button only reports what the
   * server said. A disabled button is a courtesy; the cap is a POST away from
   * being bypassed, so it lives in the route, and this reads the count back
   * from the response rather than keeping its own tally that could drift.
   */
  const [drawing, setDrawing] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const makeAvatar = async () => {
    if (!saved?.id || drawing) return;
    setDrawing(true);
    try {
      const res = await apiRequestAllowingErrors("POST", `/api/characters/${saved.id}/avatar`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: res.status === 403 ? "No free pictures left" : "That did not work",
          description: body?.message ?? "Please try again.",
          variant: "destructive",
        });
        return;
      }
      // Straight onto the form, so the picture appears without a refetch, and
      // into the cache so the Characters list agrees with it.
      form.setValue("avatarUrl", body.character?.avatarUrl);
      if (typeof body.remaining === "number") setRemaining(body.remaining);
      void queryClient.invalidateQueries({ queryKey: ["/api/characters"] });
    } catch {
      toast({ title: "That did not work", description: "Please try again.", variant: "destructive" });
    } finally {
      setDrawing(false);
    }
  };

  /**
   * Their portrait. Shown on Basics AND on Appearance.
   *
   * Blake wants to see it in both places -- Basics is where you meet the
   * character, Appearance is where you decide what they look like and so where
   * the button that draws them belongs. A function returning jsx, not a nested
   * component: see the note on vocabField about identity changing every render.
   */
  const portrait = (size: "md" | "lg") => (
    <CharacterAvatar
      size={size}
      character={{
        name: form.watch("name") || "This character",
        kind, category, gender: form.watch("gender"),
        avatarUrl: form.watch("avatarUrl"),
      }}
    />
  );

  /**
   * The tabs, in order, and the only definition of that order.
   *
   * The arrows step through THIS array, so a tab added to the list without
   * being added here would be unreachable by the arrows and reachable by
   * clicking -- which is the kind of half-working nobody notices.
   */
  const TABS = [
    { value: "basics", label: "Basics" },
    { value: "appearance", label: "Appearance" },
    { value: "personality", label: "Personality" },
    { value: "stats", label: "Statistics" },
    { value: "virtues", label: "Virtues" },
    ...(parentMode ? [{ value: "grown-ups", label: "Grown-ups" }] : []),
  ];
  const [tab, setTab] = useState("basics");
  // Parent Mode can be locked while the form is open, taking its tab with it.
  const tabIndex = Math.max(0, TABS.findIndex((t) => t.value === tab));
  const step = (by: number) => {
    const next = TABS[tabIndex + by];
    if (next) setTab(next.value);
  };

  const results = kindSearch ? searchKinds(kindSearch, 40) : [];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Make a character</CardTitle>
            <CardDescription>
              Anyone you like — a person, an animal, or something make-believe.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/*
              Tabs rather than one long scroll. The sheet has grown past what
              fits in a dialog, and the sections answer genuinely different
              questions -- what they are, what they look like, what they are
              like, what they can do, where they have been. Every tab shares ONE
              form state, so nothing is lost by switching between them
              mid-edit.
            */}
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              {/*
                FOLDER TABS. The default shadcn tab strip is a segmented control
                -- a grey pill where only the selected item has a surface -- so
                the unselected ones read as plain text and the strip does not
                read as tabs at all.

                Each trigger carries its own border and a rounded top, so an
                unselected tab is still visibly a tab. The selected one takes
                the card's background, loses its bottom border and is pulled
                down a pixel over the strip's own border, which is what joins it
                to the panel below and makes it read as the front folder.
              */}
              <div className="flex items-stretch gap-1">
                <Button
                  type="button" variant="ghost" size="icon"
                  className="shrink-0 self-end mb-[3px]"
                  onClick={() => step(-1)}
                  disabled={tabIndex === 0}
                  aria-label="Previous tab"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <TabsList className="flex-1 h-auto flex-wrap justify-start gap-1 rounded-none border-b border-border bg-transparent p-0 pt-1">
                  {TABS.map((t) => (
                    <TabsTrigger
                      key={t.value}
                      value={t.value}
                      className="relative -mb-px rounded-b-none rounded-t-md border border-border border-b-transparent bg-muted/60 px-3 py-1.5 text-muted-foreground data-[state=active]:border-b-card data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-none"
                    >
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <Button
                  type="button" variant="ghost" size="icon"
                  className="shrink-0 self-end mb-[3px]"
                  onClick={() => step(1)}
                  disabled={tabIndex >= TABS.length - 1}
                  aria-label="Next tab"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

            <TabsContent value="basics" className="space-y-5 pt-4">
              {/* Display only here. The button that makes it lives on
                  Appearance, next to the fields it draws from. */}
              <div className="flex items-center gap-4">
                {portrait("lg")}
                <p className="text-sm text-muted-foreground">
                  {form.watch("avatarUrl")
                    ? "You can draw them again on the Appearance tab."
                    : "No picture yet — make one on the Appearance tab."}
                </p>
              </div>

            {/* ---- What are they? The one question worth asking first. ---- */}
            <FormField
              control={form.control}
              name="kind"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>What are they?</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map((p) => (
                      <Button
                        key={p.kind}
                        type="button"
                        variant={field.value === p.kind ? "default" : "outline"}
                        size="sm"
                        onClick={() => chooseKind(p.kind)}
                      >
                        {p.label}
                      </Button>
                    ))}

                    {/*
                      A plain toggle button, and the list renders INLINE below.

                      This was a Popover, and it did not work: Radix's Dialog is
                      modal, so it puts pointer-events: none on the body and runs
                      a focus trap. PopoverContent portals to document.body,
                      outside DialogContent -- so clicks were swallowed and
                      autoFocus was pulled straight back into the dialog. The
                      search box could be seen and not used.

                      `<Popover modal>` was the obvious fix and does not help:
                      it changes layering, not either of those. Rendering inside
                      the dialog's own DOM removes the cause rather than working
                      around it, and cannot regress for this reason again.
                      HeroPicker and CharacterPicker keep their popovers because
                      StoryForm is not inside a dialog.

                      It also just fits better: a floating panel in a tabbed
                      dialog spilled outside the dialog's edge.
                    */}
                    <Button
                      type="button"
                      size="sm"
                      variant={
                        field.value && !PRESETS.some((p) => p.kind === field.value)
                          ? "default"
                          : "outline"
                      }
                      aria-expanded={kindOpen}
                      onClick={() => setKindOpen((o) => !o)}
                    >
                      {kindOpen ? "Close the list" : "Something else…"}
                    </Button>
                  </div>

                  {kindOpen && (
                    <div className="mt-2 rounded-md border">
                      <div className="flex items-center gap-2 border-b px-3 py-2">
                        <Search className="h-4 w-4 opacity-50" />
                        <input
                          autoFocus
                          className="flex-1 bg-transparent text-sm outline-none"
                          placeholder="Search every character…"
                          value={kindSearch}
                          onChange={(e) => setKindSearch(e.target.value)}
                        />
                      </div>
                      {/*
                        Popular first, search for the rest. There are 788 of
                        them; a list that long to scroll is worse than the text
                        box this replaced.
                      */}
                      <div className="max-h-72 overflow-y-auto p-2">
                        {results.length > 0 ? (
                          results.map((k) => (
                            <button
                              key={k}
                              type="button"
                              className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
                              onClick={() => chooseKind(k)}
                            >
                              {title(k)}
                            </button>
                          ))
                        ) : (
                          CHARACTER_CATEGORIES.map((c) => (
                            <div key={c} className="mb-3">
                              <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                                {CATEGORY_LABELS[c]}
                              </div>
                              <div className="flex flex-wrap gap-1 px-1">
                                {popularKinds(c).map((k) => (
                                  <Button
                                    key={k}
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7"
                                    onClick={() => chooseKind(k)}
                                  >
                                    {title(k)}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                        {kindSearch && results.length === 0 && (
                          <p className="px-2 py-4 text-sm text-muted-foreground">
                            Nothing called “{kindSearch}”.
                            {parentMode
                              ? " A grown-up can type it in below."
                              : " Try another word."}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {parentMode && (
                    <div className="pt-2">
                      <Input
                        placeholder="Or type anything at all (grown-ups only)"
                        value={
                          field.value && !categoryOf(field.value) ? field.value : ""
                        }
                        onChange={(e) => field.onChange(e.target.value || undefined)}
                      />
                    </div>
                  )}

                  {kind && (
                    <FormDescription>
                      {title(kind)}
                      {category ? ` — we’ll ask about ${covering}.` : " — typed in, not from the list."}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ---- Name and age ---- */}
            <div className="grid md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input placeholder="What are they called?" {...field} />
                      </FormControl>
                      {/*
                        CREATING ONLY. Rerolling the name of a character who
                        already exists is not naming them, it is renaming them --
                        and the one place you would reach for it is the one place
                        it does real damage, because stories already written
                        refer to them by the name they had.

                        `saved` is only passed by the edit dialog, so its absence
                        is what "new character" means here. Same signal the
                        picture button uses, rather than a second notion of it.

                        Shown for every kind now. It used to appear only for a
                        boy or a girl, because the only names it had were fifteen
                        biblical ones -- so most of the catalogue got no button
                        at all rather than a name that suited it.
                      */}
                      {!saved?.id && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                size="icon"
                                onClick={pickRandomName}
                                // The label is the only thing a screen reader
                                // gets: the tooltip is a hover affordance and
                                // the button has no text of its own.
                                aria-label="Generate random name"
                                className="shrink-0 bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-400"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Generate random name</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="age"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Age</FormLabel>
                    <FormControl>
                      {/*
                        A number, not a slider: a slider cannot say "no age in
                        particular", and cannot reach three hundred.
                      */}
                      <Input
                        type="number"
                        min={0}
                        max={9999}
                        placeholder="Leave blank if it doesn't matter"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ---- Everything else, folded away until it is wanted ---- */}
            </TabsContent>

            <TabsContent value="appearance" className="space-y-4 pt-4">
              <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/40 p-4">
                {portrait("lg")}
                <div className="space-y-2">
                  {saved?.id ? (
                    <>
                      <Button type="button" variant="outline" size="sm"
                              onClick={makeAvatar} disabled={drawing}>
                        {drawing
                          ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Drawing…</>
                          : <><Sparkles className="mr-2 h-4 w-4" />
                              {form.watch("avatarUrl") ? "Draw a new picture" : "Make a picture"}</>}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        {drawing
                          ? "This takes about half a minute."
                          : remaining === null
                            ? "Drawn from the fields below, or from how you describe them under Grown-ups."
                            : `${remaining} free ${remaining === 1 ? "picture" : "pictures"} left.`}
                      </p>
                    </>
                  ) : (
                    // No id yet, so there is nothing to attach a picture TO.
                    // Saying why beats a button that fails.
                    <p className="text-sm text-muted-foreground">
                      Save them first, then you can make a picture.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                  {vocabField("hair", `${title(covering)} colour`)}
                  {vocabField("eyes", "Eye colour")}
              </div>
                <FormField
                  control={form.control}
                  name="canonicalLook"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>How they look, for pictures</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={2}
                          maxLength={300}
                          placeholder="Copper scales, a torn left wing, a green scarf."
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value || undefined)}
                        />
                      </FormControl>
                      {/*
                        Said plainly, because otherwise this looks broken: it
                        is saved for drawings and changes nothing about the
                        words of the story.
                      */}
                      <FormDescription>
                        Saved for drawing them. It does not change the story text.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </TabsContent>

            <TabsContent value="personality" className="space-y-4 pt-4">
              <div className="grid md:grid-cols-2 gap-4">
                  {vocabField("favoriteColor", "Favourite colour")}
                  {vocabField("hobby", "Favourite thing to do")}
                  {vocabField("personality", "What they are like")}
                  <FormField
                    control={form.control}
                    name="favoriteAnimal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Favourite animal</FormLabel>
                        <FormControl>
                          <AnimalAutocomplete
                            value={field.value ?? ""}
                            onChange={(v) => field.onChange(v || undefined)}
                            allowNone={false}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
              </div>
                  {category === "machine" && (
                    <FormField
                      control={form.control}
                      name="sex"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Do we call them he, she, or it?</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="male">He</SelectItem>
                              <SelectItem value="female">She</SelectItem>
                              <SelectItem value="it">It</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Anything you want to say about them</FormLabel>
                        <FormControl>
                          <Textarea
                            rows={2}
                            maxLength={200}
                            placeholder="She keeps a pebble from the river in her pocket."
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value || undefined)}
                          />
                        </FormControl>
                        <FormDescription>
                          Used where it fits the story — it will not be forced in.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

            </TabsContent>

            <TabsContent value="stats" className="space-y-4 pt-4">
              {/*
                Points, not sliders you can drag to the top. Everyone starts
                ordinary on everything; the only way to be good at something is
                to have earned it, or to have accepted being worse at something
                else. Spending is free to undo -- a child will mis-click, and an
                irreversible dial on a character they love is a bad afternoon.
              */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {available} point{available === 1 ? "" : "s"} left to spend
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {earned === 0
                      ? `Everyone starts with ${STARTING_POINTS}. One more for every story they finish.`
                      : `${STARTING_POINTS} to start, and ${earned} from ${earned === 1 ? "a story" : "stories"} they have been in.`}
                  </p>
                </div>
                {parentMode && (
                  <Badge variant="secondary" title="Parent Mode ignores the points budget">
                    Spending unlimited
                  </Badge>
                )}
              </div>

              {CHARACTER_STATS.map((stat) => {
                const value = statValues[stat];
                const canRaise = value < STAT_CAP && (available > 0 || parentMode);
                return (
                  <div key={stat} className="flex items-center gap-3">
                    <span className="w-28 text-sm capitalize">{stat}</span>
                    <Button
                      type="button" variant="outline" size="icon" className="h-7 w-7"
                      disabled={value <= STAT_FLOOR}
                      onClick={() => setStat(stat, value - 1)}
                      aria-label={`Lower ${stat}`}
                    >
                      −
                    </Button>
                    <span className="w-6 text-center text-sm tabular-nums">{value}</span>
                    <Button
                      type="button" variant="outline" size="icon" className="h-7 w-7"
                      disabled={!canRaise}
                      onClick={() => setStat(stat, value + 1)}
                      aria-label={`Raise ${stat}`}
                    >
                      +
                    </Button>
                    <Progress value={(value / STAT_CAP) * 100} className="h-2 flex-1" />
                  </div>
                );
              })}

              <p className="text-xs text-muted-foreground">
                Dropping one below {STAT_BASE} gives the point back, so a character can be
                very good at one thing by being poor at another.
              </p>

              {/*
                Off altogether. Distinct from "all threes": an untouched sheet
                is a character who happens to be ordinary, and this is a
                character the story is never told about in these terms at all.
              */}
              <FormField
                control={form.control}
                name="statsEnabled"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 pt-2 border-t">
                    <FormControl>
                      <Checkbox
                        checked={field.value !== false}
                        onCheckedChange={(v) => field.onChange(v === true)}
                      />
                    </FormControl>
                    <FormLabel className="!mt-0 font-normal">
                      Use statistics for this character
                    </FormLabel>
                  </FormItem>
                )}
              />
            </TabsContent>

            <TabsContent value="virtues" className="space-y-3 pt-4">
              {/*
                A record, not a setting: nothing here is editable and none of it
                is ever sent to the model. The seventeen story themes ARE the
                virtues, so a level is simply how many finished stories carried
                that theme -- there is no mapping table to fall out of step with
                the themes the story form offers.
              */}
              <p className="text-sm text-muted-foreground">
                What {form.watch("name") || "this character"} has learned along the way. A story
                with a theme adds a level to that virtue.
              </p>
              {Object.keys(levels).length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No stories yet. Virtues appear here after they have been in one.
                </p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-2">
                  {Object.entries(levels)
                    .sort((a, b) => b[1] - a[1])
                    .map(([virtue, level]) => (
                      <div key={virtue} className="flex items-center gap-2">
                        <span className="w-28 text-sm capitalize">{virtue}</span>
                        <Badge variant="secondary">Level {level}</Badge>
                      </div>
                    ))}
                </div>
              )}
            </TabsContent>

            {parentMode && (
              <TabsContent value="grown-ups" className="space-y-4 pt-4">
                {/*
                  What sort of thing a typed kind IS.
                  
                  Only Parent Mode needs this, and only Parent Mode can produce
                  the situation: categoryOf() derives the category from the
                  catalogue, and a kind typed here is off-catalogue by
                  definition, so it derives nothing. The consequence is not
                  cosmetic -- the covering noun falls back to "hair", and a
                  space whale is described to the model as having nebula-blue
                  HAIR. This is the path most likely to hold a non-human,
                  because typing is what you do when the list has no word for it.
                */}
                {!categoryOf(kind ?? "") && (
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>What sort of thing is {form.watch("name") || "this"}?</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? ""}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Not set — we will say hair" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CHARACTER_CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>
                                {CATEGORY_LABELS[c]} — {coveringNoun(c)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Sets the word used for what covers them, and which colours
                          the Appearance tab offers.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Parent Mode</Badge>
                  <span className="text-sm text-muted-foreground">
                    Only visible while Parent Mode is unlocked.
                  </span>
                </div>
                    <FormField
                      control={form.control}
                      name="mustBeTrue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>What must always be true of them</FormLabel>
                          <FormControl>
                            <Textarea
                              rows={2}
                              maxLength={200}
                              placeholder="Mia uses a wheelchair."
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value || undefined)}
                            />
                          </FormControl>
                          <FormDescription>
                            Every chapter is told to keep this consistent, unlike the
                            note above, which the story uses only where it fits.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
              </TabsContent>
            )}
            </Tabs>
          </CardContent>

          <CardFooter>
            <Button
              type="submit"
              disabled={loading || (Boolean(saved?.id) && !form.formState.isDirty)}
              className="w-full"
            >
              {loading
                ? "Saving…"
                : !initialCharacter
                  ? "Create character"
                  : form.formState.isDirty
                    ? "Save changes"
                    : "Saved"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
