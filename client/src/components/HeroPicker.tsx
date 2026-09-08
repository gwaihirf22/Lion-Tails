import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Crown, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { groupLabel, type HeroOfFaith } from "@shared/schema";

/**
 * Choose a Hero of Faith, by searching rather than scrolling.
 *
 * The form used a plain <Select>. That was tolerable at fifteen heroes; at
 * forty-one it is a long alphabetical list where finding Tyndale means
 * scrolling past Athanasius, Augustine, Bernard, Billy Graham and Charles
 * Spurgeon first, and the biblical characters will roughly double it.
 *
 * Search covers the same ground as the Heroes page -- name, era, place, tags
 * and the biography text -- so "martyr" or "translated the Bible" finds people
 * whose names you do not know. That is the point of the feature for a parent
 * who wants a story about someone brave but cannot name one.
 */
export function HeroPicker({
  value,
  onChange,
  placeholder = "Select a Hero of the Faith",
  disabled,
}: {
  /** The selected hero id, or "" for none. */
  value: string;
  onChange: (heroId: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { data: heroes = [], isLoading } = useQuery<HeroOfFaith[]>({
    queryKey: ["/api/heroes"],
  });

  const selected = heroes.find((h) => h.id === value);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = heroes.filter((h) => {
      if (!q) return true;
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
        .includes(q);
    });

    // Grouped by era rather than one flat alphabetical list: "which of these
    // is a Puritan" is a question the list should answer by its shape.
    const byGroup = new Map<string, HeroOfFaith[]>();
    for (const h of matches) {
      const key = h.group ?? "other";
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(h);
    }
    return [...byGroup.entries()];
  }, [heroes, query]);

  const total = groups.reduce((n, [, list]) => n + list.length, 0);

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
            <Crown className="h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />
            <span className="truncate">
              {selected ? selected.name : isLoading ? "Loading…" : placeholder}
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
              placeholder="Search by name, era, or what they did"
              className="h-9 pl-8"
              aria-label="Search Heroes of Faith"
            />
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto p-1">
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted"
            >
              <X className="h-4 w-4 shrink-0 opacity-60" />
              No hero of faith
            </button>
          )}

          {total === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Nobody matches that. Try a different word.
            </p>
          )}

          {groups.map(([group, list]) => (
            <div key={group}>
              <p className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {groupLabel(group)}
              </p>
              {list.map((hero) => (
                <button
                  key={hero.id}
                  type="button"
                  onClick={() => {
                    onChange(hero.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-start gap-2 rounded px-2 py-2 text-left hover:bg-muted"
                >
                  <Check
                    className={`mt-0.5 h-4 w-4 shrink-0 ${value === hero.id ? "opacity-100" : "opacity-0"}`}
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
        </div>

        {total > 0 && (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            {total} of {heroes.length}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default HeroPicker;
