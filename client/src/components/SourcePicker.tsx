import { useMemo, useState } from "react";
import { BookOpen, Check, ChevronsUpDown, Crown, Library, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { groupLabel, type HeroOfFaith } from "@shared/schema";

/**
 * The ONE thing a story is about: an event, a person, or a passage.
 *
 * WHY ONE CONTROL AND NOT THREE. There were three -- Biblical Event, Heroes of
 * the Faith, Bible Passage to Study -- and only one of them may be used, which
 * nothing about three stacked fields says. Worse, combining them did things
 * silently: an event set beside a hero dropped the hero's whole biography from
 * the prompt, and a passage typed beside a hero flipped the story onto the
 * Scripture-retelling persona while the brief still described that person's
 * life. resolveStorySource() on the server now settles any request; this makes
 * the question unaskable in the first place.
 *
 * It also removes a second source of truth. The seventeen events were
 * hardcoded as <SelectItem>s inside the form, so adding one meant editing two
 * files, and a slug the server did not recognise fell silently through to a
 * prompt line naming the raw slug. They come from /api/biblical-events now.
 *
 * The value is a TAGGED UNION rather than a bare string, because events are
 * slugs and heroes are ids and nothing else would stop one landing in the
 * other's field. The form maps it to the three request fields in one place.
 */

export type StorySource =
  | { kind: "event"; id: string }
  | { kind: "hero"; id: string }
  | { kind: "passage"; text: string }
  | null;

type BiblicalEventOption = { id: string; label: string; passage: string };

/** What the trigger says, for a source that is already chosen. */
function summarise(
  value: StorySource,
  events: BiblicalEventOption[],
  heroes: HeroOfFaith[],
): { label: string; Icon: typeof BookOpen } | null {
  if (!value) return null;
  if (value.kind === "passage") return { label: value.text, Icon: BookOpen };
  if (value.kind === "event") {
    const e = events.find((x) => x.id === value.id);
    // Falls back to the slug rather than rendering nothing, so a source that
    // no longer exists is visible rather than looking like an empty control.
    return { label: e?.label ?? value.id, Icon: Library };
  }
  const h = heroes.find((x) => x.id === value.id);
  return { label: h?.name ?? value.id, Icon: Crown };
}

export function SourcePicker({
  value,
  onChange,
  placeholder = "Choose an event, a person, or a passage",
  disabled,
}: {
  value: StorySource;
  onChange: (next: StorySource) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { data: events = [] } = useQuery<BiblicalEventOption[]>({
    queryKey: ["/api/biblical-events"],
  });
  // Shares HeroPicker's cache key, so opening this costs no extra request
  // anywhere the hero list has already been fetched.
  const { data: heroes = [], isLoading } = useQuery<HeroOfFaith[]>({
    queryKey: ["/api/heroes"],
  });

  const q = query.trim();
  const needle = q.toLowerCase();

  const matchedEvents = useMemo(
    () =>
      events.filter(
        (e) =>
          !needle ||
          `${e.label} ${e.passage}`.toLowerCase().includes(needle),
      ),
    [events, needle],
  );

  /**
   * Searched over the same ground as the Heroes page -- name, era, place, tags
   * and the biography text -- so "martyr" or "translated the Bible" finds
   * people whose names you do not know. That is the point of the feature for
   * somebody who wants a story about someone brave but cannot name one.
   */
  const matchedHeroes = useMemo(() => {
    const matches = heroes.filter((h) => {
      if (!needle) return true;
      return [
        h.name,
        h.description,
        h.contribution,
        h.biography ?? "",
        h.place ?? "",
        h.timePeriod,
        groupLabel(h.group),
        ...(h.tags ?? []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
    const byGroup = new Map<string, HeroOfFaith[]>();
    for (const h of matches) {
      const key = h.group ?? "other";
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(h);
    }
    return [...byGroup.entries()];
  }, [heroes, needle]);

  const heroCount = matchedHeroes.reduce((n, [, list]) => n + list.length, 0);
  const chosen = summarise(value, events, heroes);

  const pick = (next: StorySource) => {
    onChange(next);
    setQuery("");
    setOpen(false);
  };

  return (
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
            {chosen ? (
              <chosen.Icon className="h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />
            ) : (
              <Search className="h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />
            )}
            <span className="truncate">
              {chosen ? chosen.label : isLoading ? "Loading…" : placeholder}
            </span>
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
              placeholder="Search, or type a reference like John 3:16"
              className="h-9 pl-8"
              aria-label="Search events, people and passages"
            />
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto p-1">
          {value && (
            <button
              type="button"
              onClick={() => pick(null)}
              className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted"
            >
              <X className="h-4 w-4 shrink-0 opacity-60" />
              Nothing in particular
            </button>
          )}

          {matchedEvents.length > 0 && (
            <div>
              <p className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Events
              </p>
              {matchedEvents.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => pick({ kind: "event", id: e.id })}
                  className="flex w-full items-start gap-2 rounded px-2 py-2 text-left hover:bg-muted"
                >
                  <Check
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      value?.kind === "event" && value.id === e.id ? "opacity-100" : "opacity-0"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{e.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {e.passage}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {matchedHeroes.map(([group, list]) => (
            <div key={group}>
              <p className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {groupLabel(group)}
              </p>
              {list.map((hero) => (
                <button
                  key={hero.id}
                  type="button"
                  onClick={() => pick({ kind: "hero", id: hero.id })}
                  className="flex w-full items-start gap-2 rounded px-2 py-2 text-left hover:bg-muted"
                >
                  <Check
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      value?.kind === "hero" && value.id === hero.id ? "opacity-100" : "opacity-0"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{hero.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {hero.timePeriod}
                      {hero.place ? ` · ${hero.place}` : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ))}

          {/* A PASSAGE is whatever was typed, offered as its own result rather
              than as a fourth field. It is the only kind that cannot be listed
              in advance, and offering it here is what makes "one control, three
              kinds" true rather than "one control and also a text box". */}
          {q.length > 0 && (
            <div>
              <p className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Passage
              </p>
              <button
                type="button"
                onClick={() => pick({ kind: "passage", text: q })}
                className="flex w-full items-start gap-2 rounded px-2 py-2 text-left hover:bg-muted"
              >
                <BookOpen className="mt-0.5 h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-sm">Study “{q}”</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    Use exactly what you typed as the passage
                  </span>
                </span>
              </button>
            </div>
          )}

          {matchedEvents.length === 0 && heroCount === 0 && q.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Search for an event, a person, or a passage.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default SourcePicker;
