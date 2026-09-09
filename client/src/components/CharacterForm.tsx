import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Pencil, Search, Undo2 } from "lucide-react";
import { characterSchema } from "@shared/schema";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  onSubmit: (data: CharacterFormValues, custom: boolean) => void;
  loading?: boolean;
  initialCharacter?: Partial<CharacterFormValues>;
};

export default function CharacterForm({
  onSubmit,
  loading = false,
  initialCharacter,
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
    },
  });

  const kind = form.watch("kind") ?? initialCharacter?.gender;
  const category = form.watch("category");
  const covering = coveringNoun(category, kind);

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

  const submit = (values: CharacterFormValues) => onSubmit(values, isCustom(values));

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

          <CardContent className="space-y-5">
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
                      `modal` is load-bearing, and only here.

                      This form is the only one rendered inside a Dialog, and
                      Radix's Dialog is modal by default: it traps focus and
                      puts pointer-events: none on the body. PopoverContent
                      portals to document.body, i.e. outside the trapped
                      subtree, so the search box could not be clicked or typed
                      in at all. Marking the popover modal makes Radix layer it
                      as its own dismissable layer above the dialog.

                      HeroPicker and CharacterPicker use the same pattern and
                      work, because they live in StoryForm, which is not in a
                      dialog. Fixed here rather than in ui/popover.tsx, which
                      four other components depend on behaving as it does.
                    */}
                    <Popover modal open={kindOpen} onOpenChange={setKindOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            field.value && !PRESETS.some((p) => p.kind === field.value)
                              ? "default"
                              : "outline"
                          }
                        >
                          Something else…
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-0" align="start">
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
                          them; a list that long to scroll is worse than the
                          text box this replaced.
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
                      </PopoverContent>
                    </Popover>
                  </div>

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
                      {/* Shown for everyone now. It used to appear only for a
                          boy or a girl, because the only names it had were
                          fifteen biblical ones -- so most of the catalogue got
                          no button at all rather than a name that suited it. */}
                      <Button type="button" variant="outline" onClick={pickRandomName} className="whitespace-nowrap">
                        Random
                      </Button>
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
            <Accordion type="multiple" className="w-full">
              <AccordionItem value="look">
                <AccordionTrigger>What they look like</AccordionTrigger>
                <AccordionContent className="grid md:grid-cols-2 gap-4 pt-1">
                  {vocabField("hair", `${title(covering)} colour`)}
                  {vocabField("eyes", "Eye colour")}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="likes">
                <AccordionTrigger>What they like</AccordionTrigger>
                <AccordionContent className="grid md:grid-cols-2 gap-4 pt-1">
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
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="more">
                <AccordionTrigger>Anything else</AccordionTrigger>
                <AccordionContent className="space-y-4 pt-1">
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
                </AccordionContent>
              </AccordionItem>

              {parentMode && (
                <AccordionItem value="parent">
                  <AccordionTrigger>
                    <span className="flex items-center gap-2">
                      Grown-ups only <Badge variant="secondary">Parent Mode</Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pt-1">
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
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
          </CardContent>

          <CardFooter>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Saving…" : initialCharacter ? "Save changes" : "Create character"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
