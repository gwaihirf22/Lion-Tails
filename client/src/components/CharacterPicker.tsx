import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Crown, Pencil, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MAX_STORY_CHARACTERS, type Character } from "@shared/schema";

/**
 * Choose the cast of a story, in order.
 *
 * Built on HeroPicker's shape -- searchable popover, check-mark selection, a
 * count in the footer -- because that component already solved
 * search-instead-of-scroll for a list that outgrew a <Select>. Three things
 * differ, and each is a consequence of picking several rather than one:
 *
 *  1. The popover does NOT close on select. Choosing eight people through a
 *     closing popover is eight round trips.
 *  2. Groups are "in this story" and "not in this story" rather than eras,
 *     because that is the distinction that matters while you are choosing.
 *  3. At the cap, unselected rows are disabled with a reason rather than
 *     silently doing nothing when clicked.
 *
 * ORDER IS MEANINGFUL. Index 0 is the protagonist and gets the whole
 * description in the prompt; everyone else gets a name and two facts. A rule
 * that load-bearing must not be invisible, so the lead wears a crown and any
 * other row can be promoted in one click.
 */
export function CharacterPicker({
  value,
  onChange,
  confirmRemoveIds = [],
  parentStoryTitle,
  onEdit,
  disabled,
}: {
  /** Selected character ids, in order. Index 0 is the protagonist. */
  value: string[];
  onChange: (ids: string[]) => void;
  /**
   * Ids inherited from a story being continued. Removing one of these asks
   * first -- they arrived because they were in the last story, so dropping one
   * by a stray click is losing something the user did not choose to lose.
   */
  confirmRemoveIds?: string[];
  parentStoryTitle?: string;
  onEdit?: (character: Character) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<Character | null>(null);

  const { data: characters = [], isLoading } = useQuery<Character[]>({
    queryKey: ["/api/characters"],
  });

  const byId = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters]);
  const chosen = value.map((id) => byId.get(id)).filter((c): c is Character => Boolean(c));
  const atCap = value.length >= MAX_STORY_CHARACTERS;

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = characters.filter((c) => {
      if (!q) return true;
      return [
        c.name, c.gender, String(c.age), c.hair, c.eyes,
        c.favoriteColor, c.favoriteAnimal ?? "", c.hobby ?? "", c.personality ?? "",
      ].join(" ").toLowerCase().includes(q);
    });
    return {
      inStory: matches.filter((c) => value.includes(c.id)),
      notInStory: matches.filter((c) => !value.includes(c.id)),
    };
  }, [characters, query, value]);

  const add = (id: string) => {
    if (value.includes(id) || atCap) return;
    onChange([...value, id]);
  };

  /**
   * One removal path for both controls -- the chip's X and clicking a selected
   * row. Two paths would mean one of them could skip the confirm, which is
   * exactly the accident this is here to prevent.
   */
  const requestRemove = (id: string) => {
    const character = byId.get(id);
    if (character && confirmRemoveIds.includes(id)) {
      setPendingRemoval(character);
      return;
    }
    onChange(value.filter((v) => v !== id));
  };

  const promote = (id: string) => onChange([id, ...value.filter((v) => v !== id)]);

  const label =
    chosen.length === 0
      ? isLoading
        ? "Loading characters…"
        : "Choose who is in this story"
      : chosen.length <= 3
        ? chosen.map((c) => c.name).join(", ")
        : `${chosen[0].name}, ${chosen[1].name} and ${chosen.length - 2} others`;

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || isLoading}
            className="w-full justify-between font-normal"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Crown className="h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />
              <span className="truncate">{label}</span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, or what they are like"
                className="h-9 pl-8"
                aria-label="Search characters"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto p-1">
            {characters.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                No characters yet. Create one on the Characters page first.
              </p>
            )}

            {([
              ["In this story", groups.inStory, true],
              ["Not in this story", groups.notInStory, false],
            ] as const).map(([heading, list, selected]) =>
              list.length === 0 ? null : (
                <div key={heading}>
                  <p className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {heading}
                  </p>
                  {list.map((c) => {
                    // Disabled rather than a click that quietly does nothing:
                    // a control that cannot fail and cannot succeed teaches
                    // the user that the app is broken.
                    const blocked = !selected && atCap;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={blocked}
                        onClick={() => (selected ? requestRemove(c.id) : add(c.id))}
                        className="flex w-full items-start gap-2 rounded px-2 py-2 text-left hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                      >
                        <Check
                          className={`mt-0.5 h-4 w-4 shrink-0 ${selected ? "opacity-100" : "opacity-0"}`}
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{c.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {c.gender}, {c.age}
                            {c.personality ? ` · ${c.personality}` : ""}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ),
            )}
          </div>

          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            {atCap
              ? `${MAX_STORY_CHARACTERS} is the most a story can hold. Remove someone to add someone else.`
              : `${value.length} of ${MAX_STORY_CHARACTERS} chosen · ${characters.length} to choose from`}
          </p>
        </PopoverContent>
      </Popover>

      {chosen.length > 0 && (
        <>
          <ul className="flex flex-wrap gap-2">
            {chosen.map((c, i) => (
              <li
                key={c.id}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-2.5 pr-1.5 text-sm"
              >
                {i === 0 ? (
                  <Crown
                    className="h-3.5 w-3.5 shrink-0 fill-current text-secondary"
                    aria-label="Main character"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => promote(c.id)}
                    title={`Make ${c.name} the main character`}
                    aria-label={`Make ${c.name} the main character`}
                    className="rounded-full p-0.5 opacity-40 hover:opacity-100"
                  >
                    <Crown className="h-3.5 w-3.5" />
                  </button>
                )}
                <span className="truncate">{c.name}</span>
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(c)}
                    title={`Edit ${c.name}`}
                    aria-label={`Edit ${c.name}`}
                    className="rounded-full p-0.5 opacity-50 hover:opacity-100"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => requestRemove(c.id)}
                  title={`Remove ${c.name}`}
                  aria-label={`Remove ${c.name} from this story`}
                  className="rounded-full p-0.5 opacity-50 hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            The first character is the main one — the story follows them.
          </p>
        </>
      )}

      <AlertDialog
        open={Boolean(pendingRemoval)}
        onOpenChange={(o) => !o && setPendingRemoval(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Leave {pendingRemoval?.name} out of this story?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {parentStoryTitle ? (
                <>
                  This story continues <em>{parentStoryTitle}</em>, and{" "}
                  {pendingRemoval?.name} was in it. Leaving them out is allowed —
                  this story just will not include them.
                </>
              ) : (
                <>
                  {pendingRemoval?.name} was in the story you are continuing.
                  Leaving them out is allowed — this story just will not include
                  them.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* Keeping is the default. Adding someone back is one click, so the
                asymmetry is deliberate: only the lossy direction asks. */}
            <AlertDialogCancel>Keep {pendingRemoval?.name}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRemoval) onChange(value.filter((v) => v !== pendingRemoval.id));
                setPendingRemoval(null);
              }}
            >
              Leave them out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default CharacterPicker;
