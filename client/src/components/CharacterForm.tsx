import { useState, useEffect, useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Pencil, Search, Undo2 } from "lucide-react";
import {
  SKILL_START,
  type CharacterSkill,
  skillsOf,
  MAX_SKILLS,
  unseenVirtues,
  statsEnabledFor,
  pointsAvailable,
  avatarsOf,
  MAX_AVATARS,
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequestAllowingErrors } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { FOLDER_TAB_LIST, FOLDER_TAB_SCROLLER, FOLDER_TAB_TRIGGER } from "@/lib/folderTabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Sparkles, RefreshCw, RotateCcw, ChevronLeft, ChevronRight, X, Plus, Lock } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useParentMode } from "@/hooks/use-parent-mode";
import { useStories } from "@/hooks/use-stories";
import { characterIdsOf } from "@shared/schema";
import StoryRow from "@/components/StoryRow";
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
      {/* min-w-0, or the Input's ~20ch minimum stops this column shrinking. */}
      <div className="min-w-0 flex-1">
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
  saved?: Pick<Character, "adventures" | "id" | "avatarUrl" | "avatarPrompt" | "avatars" | "createdAt" | "seenVirtues">;
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
      skills: initialCharacter?.skills,
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
  // pointsAvailable existed and this re-derived it. The override is what lets
  // the card ask about the stored sheet and the form about the one being
  // dragged around right now, from one function.
  const [skillDraft, setSkillDraft] = useState("");
  const skillValues = skillsOf({ skills: form.watch("skills") });
  const available = pointsAvailable(saved ?? {}, statValues, skillValues);
  const levels = virtueLevels(saved);

  const setSkill = (name: string, value: number) => {
    if (value < STAT_FLOOR || value > STAT_CAP) return;
    form.setValue("skills", skillValues.map((sk: CharacterSkill) => (sk.name === name ? { ...sk, value } : sk)), {
      shouldDirty: true,
    });
  };
  const addSkill = (name: string) => {
    const clean = name.trim();
    // Refused here AND on the server. A duplicate would cost a second point and
    // say nothing the first did not.
    if (!clean || skillValues.some((sk: CharacterSkill) => sk.name.toLowerCase() === clean.toLowerCase())) return;
    if (skillValues.length >= MAX_SKILLS) return;
    // Level 1, which is what one point buys. A skill's cost IS its level:
    // nobody has a skill by default, so there is no baseline to measure from.
    form.setValue("skills", [...skillValues, { name: clean, value: SKILL_START }], {
      shouldDirty: true,
    });
  };
  const removeSkill = (name: string) =>
    form.setValue("skills", skillValues.filter((sk: CharacterSkill) => sk.name !== name), { shouldDirty: true });

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
              <SelectContent portalled={false}>
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
  /**
   * Their pictures, and which one is chosen.
   *
   * Held here rather than read from `saved` on every render because the routes
   * return the updated character and this screen should show it immediately --
   * waiting on a refetch would leave a picture the user just made missing for a
   * beat. Seeded from the row, then only ever replaced by a server response.
   */
  const [gallery, setGallery] = useState(() => avatarsOf(saved));
  const applyCharacter = (c?: Character) => {
    if (!c) return;
    setGallery(avatarsOf(c));
    form.setValue("avatarUrl", c.avatarUrl);
  };

  /**
   * Take the server's word for it whenever the row changes.
   *
   * Generation finishes whether or not anyone is listening -- Express does not
   * abort a handler when the socket closes, and a picture started before the
   * tab was shut is saved regardless. What was missing is that the open card
   * never found out. Now the page looks the row up by id on every refetch, and
   * this adopts it.
   *
   * Compared by content, not identity: a refetch returns a new array every
   * time, and depending on identity would reset the strip on every render.
   * Skipped mid-draw so the server's answer, not a stale refetch, wins the
   * race.
   */
  const savedShape = JSON.stringify([avatarsOf(saved).map((a) => a.id), saved?.avatarUrl]);
  useEffect(() => {
    if (drawing) return;
    setGallery(avatarsOf(saved));
    if (saved?.avatarUrl !== form.getValues("avatarUrl")) {
      form.setValue("avatarUrl", saved?.avatarUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedShape]);

  /**
   * How many pictures this ACCOUNT may keep per character.
   *
   * Read from the server, never worked out here: the generate route enforces
   * avatarCapFor() and a second opinion in the UI is a thing that can disagree
   * with it. Defaults to 1 while the query is in flight, which is the cautious
   * direction -- it shows one slot too few for a moment rather than offering a
   * slot the server will refuse.
   */
  const { data: entitlement } = useQuery<{ avatarCap?: number }>({
    queryKey: ["/api/settings/models"],
  });
  const avatarCap = entitlement?.avatarCap ?? 1;

  const [askOpen, setAskOpen] = useState(false);
  const [note, setNote] = useState("");
  const [remember, setRemember] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const [drawing, setDrawing] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const pickAvatar = async (avatarId: string) => {
    if (!saved?.id) return;
    const res = await apiRequestAllowingErrors("PUT", `/api/characters/${saved.id}/avatar/${avatarId}`);
    if (!res.ok) return;
    applyCharacter(await res.json().catch(() => undefined));
    void queryClient.invalidateQueries({ queryKey: ["/api/characters"] });
  };

  const removeAvatar = async (avatarId: string) => {
    if (!saved?.id) return;
    const res = await apiRequestAllowingErrors("DELETE", `/api/characters/${saved.id}/avatar/${avatarId}`);
    if (!res.ok) return;
    applyCharacter(await res.json().catch(() => undefined));
    void queryClient.invalidateQueries({ queryKey: ["/api/characters"] });
  };

  const makeAvatar = async () => {
    if (!saved?.id || drawing) return;
    setAskOpen(false);
    setDrawing(true);
    try {
      const res = await apiRequestAllowingErrors("POST", `/api/characters/${saved.id}/avatar`, {
        note: note.trim() || undefined,
        remember: remember && Boolean(note.trim()),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title:
            res.status === 409
              ? "No room for another picture"
              : res.status === 403
                ? "No free pictures left"
                : "That did not work",
          description: body?.message ?? "Please try again.",
          variant: "destructive",
        });
        return;
      }
      // Straight onto the form, so the picture appears without a refetch, and
      // into the cache so the Characters list agrees with it.
      applyCharacter(body.character);
      if (typeof body.remaining === "number") setRemaining(body.remaining);
      void queryClient.invalidateQueries({ queryKey: ["/api/characters"] });
    } catch {
      toast({ title: "That did not work", description: "Please try again.", variant: "destructive" });
    } finally {
      setDrawing(false);
      setNote("");
      setRemember(false);
      // Whatever happened, the row is the truth. A generation that finished
      // after the client gave up shows up here rather than staying invisible.
      void queryClient.invalidateQueries({ queryKey: ["/api/characters"] });
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
  /**
   * Class names are written out IN FULL, never built from t.value.
   *
   * Tailwind's scanner only sees string literals: BookPage once composed its
   * background class by interpolation and the whole colour picker silently did
   * nothing for months, because the class was never emitted. ci.yml records it.
   */
  const TABS = [
    { value: "basics", label: "Basics", tint: "bg-tab-basics", edge: "border-t-tab-basics" },
    { value: "appearance", label: "Appearance", tint: "bg-tab-appearance", edge: "border-t-tab-appearance" },
    { value: "personality", label: "Personality", tint: "bg-tab-personality", edge: "border-t-tab-personality" },
    // "Statistics" read as a record of things done, which is what Virtues
    // actually is. These are what the character CAN do.
    //
    // The VALUE stays "stats": it is the key for --tab-stats, the tailwind map
    // and TAB_TINTS in the theme test, and renaming it would be a coordinated
    // four-file change buying nothing a label already says.
    { value: "stats", label: "Attributes/Skills", tint: "bg-tab-stats", edge: "border-t-tab-stats" },
    { value: "virtues", label: "Virtues", tint: "bg-tab-virtues", edge: "border-t-tab-virtues" },
    // Only when editing: a character being created has no stories, and the
    // arrows step through this array, so a tab that exists must be reachable.
    ...(saved?.id
      ? [{ value: "stories", label: "Stories", tint: "bg-tab-stories", edge: "border-t-tab-stories" }]
      : []),
    ...(parentMode
      ? [{ value: "grown-ups", label: "Grown-ups", tint: "bg-tab-grown-ups", edge: "border-t-tab-grown-ups" }]
      : []),
  ];
  /**
   * What the tab badges are counting.
   *
   * Stats stays quiet when the sheet is switched off -- a character nobody is
   * levelling should not nag -- and when the total is negative, which a Parent
   * Mode sheet can produce and which is not something to spend.
   */
  const unspent = statsEnabledFor({ statsEnabled: form.watch("statsEnabled") })
    ? Math.max(0, available)
    : 0;
  const unseen = unseenVirtues(saved).length;

  const [tab, setTab] = useState("basics");
  /** The scrolling strip, so a tab stepped to with the arrows can be shown. */
  const stripRef = useRef<HTMLDivElement>(null);
  // The library, filtered to this character. Cached app-wide; free here.
  const { stories: allStories } = useStories();
  const storiesIn = saved?.id
    ? allStories
        .filter((s) => characterIdsOf(s.request).includes(saved.id))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : [];
  // Parent Mode can be locked while the form is open, taking its tab with it.
  const tabIndex = Math.max(0, TABS.findIndex((t) => t.value === tab));
  /**
   * Opening the Virtues tab is what "seen" means.
   *
   * Fired from the tab change rather than a render effect so it cannot run for
   * a tab nobody looked at, and guarded on there being something unseen so it
   * is not a write on every visit.
   */
  const markVirtuesSeen = async () => {
    if (!saved?.id || unseen === 0) return;
    const res = await apiRequestAllowingErrors("PUT", `/api/characters/${saved.id}/virtues/seen`);
    if (res.ok) void queryClient.invalidateQueries({ queryKey: ["/api/characters"] });
  };

  const openTab = (next: string) => {
    setTab(next);
    if (next === "virtues") void markVirtuesSeen();
    /**
     * The strip is one row that scrolls, so the arrows can step to a tab
     * that is off-screen. Bring it into view by moving THIS element's
     * scrollLeft and nothing else.
     *
     * NOT scrollIntoView: it walks every scrollable ancestor, and the
     * dialog is one of them -- its overflow-y-auto makes the x axis auto
     * too (CSS never pairs visible with a non-visible value), so
     * inline:"nearest" would scroll the whole card sideways.
     *
     * BY INDEX, not by a value attribute. Radix destructures `value` out
     * of the trigger's props and never renders it, so the obvious
     * `[value="..."]` selector matches nothing and fails silently -- which
     * is how the first version of this shipped doing nothing at all.
     */
    requestAnimationFrame(() => {
      const strip = stripRef.current;
      const index = TABS.findIndex((t) => t.value === next);
      const el = strip?.querySelectorAll<HTMLElement>('[role="tab"]')[index];
      if (!strip || !el) return;
      // Rects, not offsetLeft: the trigger's offsetParent is whichever
      // positioned ancestor happens to be nearest, which is not the strip.
      const view = strip.getBoundingClientRect();
      const tab = el.getBoundingClientRect();
      // A tab already fully visible does not move.
      if (tab.left < view.left) strip.scrollLeft -= view.left - tab.left + 8;
      else if (tab.right > view.right) strip.scrollLeft += tab.right - view.right + 8;
    });
  };

  const step = (by: number) => {
    const next = TABS[tabIndex + by];
    if (next) openTab(next.value);
  };

  const results = kindSearch ? searchKinds(kindSearch, 40) : [];

  return (
    <Form {...form}>
      {/*
        min-w-0, and it is the whole reason this dialog used to overflow.

        DialogContent is `display: grid`, so this form is a GRID ITEM -- and a
        grid item's `min-width` defaults to `auto`, meaning it refuses to
        shrink below its own min-content. The tab strip's list is `w-max`, and
        a max-content box still contributes its full width to that minimum even
        though it sits inside an overflow container. So the column was forced to
        the width of seven tabs (~840px), the dialog's box was 720px, and every
        row in the form spilled past the right edge with the whole card
        scrolling sideways -- on a phone and on a desktop alike.

        Setting it to 0 lets the column take the dialog's width; the strip then
        shrinks and scrolls inside itself, which is what it was built to do.
      */}
      <form onSubmit={form.handleSubmit(submit)} className="min-w-0 space-y-6">
        <Card>
          <CardHeader>
            {/*
              Whose card this is, when it is somebody's. Editing said "Make a
              character" over a character who already existed, which is the
              wrong sentence and hides the one thing worth knowing at a glance.
              `saved` is the same signal the picture button uses.
            */}
            <CardTitle>{saved?.id ? form.watch("name") || "This character" : "Make a character"}</CardTitle>
            <CardDescription>
              {saved?.id
                ? "Make changes to this character here, and don't forget to apply your Attribute and Skill points."
                : "Anyone you like — a person, an animal, or something make-believe."}
            </CardDescription>
          </CardHeader>

          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {/*
              Tabs rather than one long scroll. The sheet has grown past what
              fits in a dialog, and the sections answer genuinely different
              questions -- what they are, what they look like, what they are
              like, what they can do, where they have been. Every tab shares ONE
              form state, so nothing is lost by switching between them
              mid-edit.
            */}
            <Tabs value={tab} onValueChange={openTab} className="w-full">
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
              {/*
                items-END, not items-stretch. Stretching made TabsList grow to
                the height of the icon buttons beside it, so its bottom border
                sat several pixels BELOW the tabs instead of under them -- the
                selected tab's card-coloured border had nothing to cover, and
                the line ran straight through the front folder. The arrows now
                bottom-align with the strip instead of being nudged with a
                margin.
              */}
              <div className="flex items-end gap-1">
                <Button
                  type="button" variant="ghost" size="icon"
                  className="shrink-0"
                  onClick={() => step(-1)}
                  disabled={tabIndex === 0}
                  aria-label="Previous tab"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className={FOLDER_TAB_SCROLLER} ref={stripRef}>
                  <TabsList className={FOLDER_TAB_LIST}>
                    {TABS.map((t) => {
                      const count = t.value === "stats" ? unspent : t.value === "virtues" ? unseen : 0;
                      return (
                        <TabsTrigger
                          key={t.value}
                          value={t.value}
                          className={cn(
                            FOLDER_TAB_TRIGGER,
                            // Its own colour when it is one of the closed folders,
                            // and the same colour as a top edge when it is the
                            // open one -- which has to stay bg-card, because that
                            // is what joins it to the panel below.
                            t.tint,
                            t.edge,
                          )}
                        >
                          {t.label}
                          {count > 0 && (
                            <span
                              // A plain title, not a Tooltip: this sits inside a
                              // modal Dialog, where a portalled Radix layer is
                              // the thing that has already bitten this file once.
                              // The card's bubbles are not in a dialog and use a
                              // real tooltip.
                              title={
                                t.value === "stats"
                                  ? `${count} Attribute/Skill point${count === 1 ? "" : "s"}`
                                  : `${count} new virtue${count === 1 ? "" : "s"} to look at`
                              }
                              className={cn(
                                "absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none",
                                // Red for "there is something here". destructive is
                                // the only red that follows all four palettes, and
                                // an attention red sharing a token with a danger
                                // red is the ordinary convention -- it is not
                                // saying this is dangerous.
                                t.value === "stats"
                                  ? "bg-destructive text-destructive-foreground"
                                  : "bg-tab-virtues text-foreground ring-1 ring-border",
                              )}
                            >
                              {count}
                            </span>
                          )}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </div>

                <Button
                  type="button" variant="ghost" size="icon"
                  className="shrink-0"
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
                      {/* min-w-0: an input's intrinsic minimum is about twenty
                          characters, and w-full does not override it -- without
                          this the row cannot shrink below ~250px and pushes the
                          whole dialog wider than the phone. */}
                      <FormControl className="min-w-0 flex-1">
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
                                className="shrink-0 bg-action text-action-foreground hover:bg-action/90 focus-visible:ring-action"
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
              {/*
                WRAPS, and the gallery below is the third child of this row --
                the indentation makes it look like a sibling and it is not.
                
                Three things were missing and each one shoved the tiles further
                past the border on a narrow screen: the row never wrapped, the
                portrait had no shrink-0 so it squashed first, and the text
                column had no min-w-0 -- so the longest word in the helper
                paragraph set a floor the row could not shrink below.
              */}
              <div className="flex flex-wrap items-start gap-4 rounded-lg border border-border bg-muted/40 p-4">
                {portrait("lg")}
                <div className="min-w-0 flex-1 space-y-2">
                  {saved?.id ? (
                    <>
                      <Button type="button" variant="outline" size="sm"
                              className="w-full sm:w-auto"
                              onClick={() => setAskOpen(true)}
                              disabled={drawing || gallery.length >= avatarCap}>
                        {drawing
                          ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Drawing…</>
                          : <><Sparkles className="mr-2 h-4 w-4" />
                              {form.watch("avatarUrl") ? "Draw a new picture" : "Make a picture"}</>}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        {drawing
                          ? "This takes about half a minute."
                          : gallery.length >= avatarCap
                              ? avatarCap === 1
                                ? "Delete this one to draw another, or add your own API key in Settings to keep more."
                                : `${avatarCap} pictures is the most one character can keep — delete one to draw another.`
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

              {/*
                ALWAYS VISIBLE, even at one picture.
                
                It used to hide below two, so a character with a single
                portrait had nothing on screen saying more were possible. The
                empty slot IS the affordance: it is the same size as a picture,
                so the row reads as a set with a gap in it rather than as one
                image with a button somewhere else.
                
                Three across before it folds. The cap is five, so at most two
                are ever hidden -- but a fifth tile pushes the fields below it
                off the card on a phone, which is the thing worth avoiding.
              */}
              {saved?.id && (
                <div className="w-full space-y-2 sm:w-auto">
                  <div className="flex flex-wrap gap-2">
                    {(showAll ? gallery : gallery.slice(0, 3)).map((a: { id: string; url: string }) => {
                      const chosen = a.url === form.watch("avatarUrl");
                      return (
                        <div key={a.id} className="relative">
                          <button
                            type="button"
                            onClick={() => void pickAvatar(a.id)}
                            aria-label={chosen ? "Chosen picture" : "Use this picture"}
                            aria-pressed={chosen}
                            className={cn(
                              "block h-20 w-20 overflow-hidden rounded-lg border-2 transition-colors",
                              chosen ? "border-primary" : "border-transparent hover:border-border",
                            )}
                          >
                            <img src={a.url} alt="" className="h-full w-full object-cover" />
                          </button>
                          <Button
                            type="button" variant="secondary" size="icon"
                            className="absolute -right-2 -top-2 h-6 w-6 rounded-full"
                            onClick={() => void removeAvatar(a.id)}
                            aria-label="Delete this picture"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}

                    {/* The empty slot, or the reason there isn't one. */}
                    {(showAll || gallery.length < 3) && (
                      gallery.length < avatarCap ? (
                        <button
                          type="button"
                          onClick={() => setAskOpen(true)}
                          disabled={drawing}
                          className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
                        >
                          {drawing
                            ? <Loader2 className="h-5 w-5 animate-spin" />
                            : <><Plus className="h-5 w-5" />
                                <span className="px-1 text-[10px] leading-tight">Add more photos</span></>}
                        </button>
                      ) : avatarCap === 1 ? (
                        // Not a failure, a plan. Say which one they are on.
                        <div className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border/60 px-1 text-center text-[10px] leading-tight text-muted-foreground">
                          <Lock className="h-4 w-4" />
                          <span>Add your own API key for up to {MAX_AVATARS}</span>
                        </div>
                      ) : null
                    )}
                  </div>

                  {gallery.length > 3 && (
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs"
                            onClick={() => setShowAll((v) => !v)}>
                      {showAll ? "Show fewer" : `Show all (${gallery.length})`}
                    </Button>
                  )}
                </div>
              )}
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
                            <SelectContent portalled={false}>
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

              <p className="pt-1 text-sm font-semibold">Attributes</p>
              {CHARACTER_STATS.map((stat) => {
                const value = statValues[stat];
                const canRaise = value < STAT_CAP && (available > 0 || parentMode);
                return (
                  <div key={stat} className="flex items-center gap-3">
                    <span className="w-20 sm:w-28 shrink-0 text-sm capitalize">{stat}</span>
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
                SKILLS. The half of this tab that says something a number
                cannot: "good at climbing" is specific in a way a sixth
                attribute would not be, and it costs one clause in the prompt.

                They spend from the SAME pool -- a new one starts one above the
                baseline, so having it costs a point by exactly the arithmetic
                the attributes already use. That is why nothing here needs its
                own budget: pointsSpent counts them without knowing they are
                different.
              */}
              <div className="space-y-3 border-t pt-4">
                <div>
                  <p className="text-sm font-semibold">Skills</p>
                  <p className="text-xs text-muted-foreground">
                    Things they have learned to do. A skill costs its level — one point
                    to take it up, and one more for each level after that.
                  </p>
                </div>

                {skillValues.map((sk: CharacterSkill) => (
                  <div key={sk.name} className="flex items-center gap-3">
                    <span className="w-20 sm:w-28 shrink-0 truncate text-sm capitalize" title={sk.name}>{sk.name}</span>
                    <Button
                      type="button" variant="outline" size="icon" className="h-7 w-7"
                      disabled={sk.value <= STAT_FLOOR}
                      onClick={() => setSkill(sk.name, sk.value - 1)}
                      aria-label={`Lower ${sk.name}`}
                    >
                      −
                    </Button>
                    <span className="w-6 text-center text-sm tabular-nums">{sk.value}</span>
                    <Button
                      type="button" variant="outline" size="icon" className="h-7 w-7"
                      disabled={sk.value >= STAT_CAP || (available <= 0 && !parentMode)}
                      onClick={() => setSkill(sk.name, sk.value + 1)}
                      aria-label={`Raise ${sk.name}`}
                    >
                      +
                    </Button>
                    <Progress value={(sk.value / STAT_CAP) * 100} className="h-2 flex-1" />
                    <Button
                      type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                      onClick={() => removeSkill(sk.name)}
                      aria-label={`Remove ${sk.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}

                {skillValues.length >= MAX_SKILLS ? (
                  <p className="text-xs text-muted-foreground">
                    {MAX_SKILLS} skills is the most one character can keep — a sheet
                    with more than a handful of notable things stops having anything
                    notable about it.
                  </p>
                ) : available <= 0 && !parentMode ? (
                  <p className="text-xs text-muted-foreground">
                    No points left. Finish a story to earn one, or lower something above.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <Select value="" onValueChange={addSkill}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Add a skill…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent portalled={false}>
                        {optionsFor("skill")
                          .filter((o) => !skillValues.some((sk: CharacterSkill) => sk.name === o))
                          .map((o) => (
                            <SelectItem key={o} value={o}>{title(o)}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>

                    {/*
                      NOT ParentEditable, which every other field here uses.
                      That component reports on every keystroke, which is right
                      for a field whose value IS the text and wrong for adding
                      to a list: typing "climbing" would add "c", then "cl",
                      then "cli", until it hit the cap. A draft plus an explicit
                      commit, the same shape pinned canon uses.
                    */}
                    {parentMode && (
                      <div className="flex gap-2">
                        <Input
                          value={skillDraft}
                          onChange={(e) => setSkillDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            // Or it submits the whole character.
                            e.preventDefault();
                            addSkill(skillDraft);
                            setSkillDraft("");
                          }}
                          placeholder="Or type anything — breathing fire, whistling…"
                          className="text-sm"
                        />
                        <Button
                          type="button" variant="outline" size="sm"
                          disabled={!skillDraft.trim()}
                          onClick={() => { addSkill(skillDraft); setSkillDraft(""); }}
                        >
                          Add
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

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
                      Use attributes and skills for this character
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
                        <span className="w-20 sm:w-28 shrink-0 text-sm capitalize">{virtue}</span>
                        <Badge variant="secondary">Level {level}</Badge>
                      </div>
                    ))}
                </div>
              )}
            </TabsContent>

            {saved?.id && (
              <TabsContent value="stories" className="space-y-3 pt-4">
                {/*
                  A record, like Virtues: nothing here is editable. The cast of
                  every saved story is read through characterIdsOf(), the one
                  reader of that fact, over the library the app already holds --
                  no route, no second list. Rows, not cards: a card navigates on
                  click and owns dialogs, and this sits inside an open Dialog
                  over a half-edited form.
                */}
                <p className="text-sm text-muted-foreground">
                  Every story {form.watch("name") || "this character"} has been in.
                </p>
                {storiesIn.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    No stories yet. They appear here after {form.watch("name") || "this character"} has been in one.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {storiesIn.map((s) => (
                      <StoryRow key={s.id} story={s} />
                    ))}
                  </div>
                )}
              </TabsContent>
            )}

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
                          <SelectContent portalled={false}>
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

          <CardFooter className="gap-2">
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
            {/*
              Reset, not cancel. It puts the form back to what is STORED, which
              is why it is disabled when nothing is dirty -- there would be
              nothing to undo, and a live button that does nothing teaches people
              to distrust the ones that do.

              form.reset() with no argument goes back to the values the form was
              constructed with, and after a successful save those are the saved
              ones, because submit() resets to what it just sent. So this always
              means "back to the last save", never "back to when I opened this".
            */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => form.reset()}
                      disabled={loading || !form.formState.isDirty}
                      aria-label="Reset character"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Reset character</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardFooter>
        </Card>

        {/*
          ASK BEFORE SPENDING. A picture costs one of a small lifetime
          allowance and about half a minute, and the button used to fire on the
          first click -- so a stray click was a picture nobody wanted.
          
          A Dialog rather than an AlertDialog because it holds a text field,
          and every text input in this app lives in a Dialog. It is nested
          inside the edit Dialog, which is the supported Radix case (Select
          already works here) unlike the Popover recorded further up this file
          -- but the focus trap is the thing to actually try, not assume.
        */}
        <Dialog open={askOpen} onOpenChange={setAskOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {gallery.length === 0 ? "Make a picture" : "Draw another picture"} of{" "}
                {form.watch("name") || "this character"}
              </DialogTitle>
              <DialogDescription>
                {gallery.length === 0
                  ? "Anything to add about how they look? This is optional."
                  : "How should this one be different? Leave it blank for another go at the same thing."}
              </DialogDescription>
            </DialogHeader>

            <Textarea
              autoFocus
              rows={3}
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={gallery.length === 0 ? "Holding a lantern." : "Wearing a blue scarf."}
            />

            {/*
              Off by default. A one-off stays one-off unless someone says
              otherwise, and canonicalLook is a field they can see and edit.
              Disabled when it will not fit rather than quietly cutting the end
              off a description somebody wrote.
            */}
            {(() => {
              const merged = [form.watch("canonicalLook"), note.trim()].filter(Boolean).join(" ");
              const fits = merged.length <= 300;
              return (
                <label className={cn("flex items-start gap-2 text-sm", !fits && "opacity-60")}>
                  <Checkbox
                    checked={remember && fits}
                    disabled={!note.trim() || !fits}
                    onCheckedChange={(c) => setRemember(Boolean(c))}
                    className="mt-0.5"
                  />
                  <span>
                    Remember this for future pictures
                    <span className="block text-xs text-muted-foreground">
                      {!fits
                        ? "Their description is already full — edit “How they look, for pictures” instead."
                        : "Adds it to their description, so later pictures keep it too."}
                    </span>
                  </span>
                </label>
              );
            })()}

            {/*
              The bit that is not obvious: every new picture is drawn FROM an
              existing one, which is what keeps them the same character and
              also what stops a small note changing very much. Say so, rather
              than letting people conclude the box does not work.
            */}
            <p className="text-xs text-muted-foreground">
              {gallery.length > 0
                ? "Each new picture is drawn from the one chosen now, so it will stay close to it. For a really different look, change “How they look, for pictures” and delete the old pictures first."
                : "Drawn from what they look like on this tab."}
            </p>

            <DialogFooter className="gap-2 sm:justify-between">
              <span className="self-center text-xs text-muted-foreground">
                {remaining === null ? "" : `Uses 1 of your ${remaining} free ${remaining === 1 ? "picture" : "pictures"}.`}
              </span>
              <span className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setAskOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={makeAvatar} disabled={drawing}>
                  {drawing ? "Drawing…" : "Make it"}
                </Button>
              </span>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </form>
    </Form>
  );
}
