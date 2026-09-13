import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { type Character } from "@shared/schema";
import {
  MAX_PETS,
  RELATIONS,
  relationLabel,
  type CharacterRelation,
  type Pet,
  type Relation,
} from "@shared/family";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AnimalAutocomplete from "./AnimalAutocomplete";

/**
 * Who among the reader's other characters is family.
 *
 * SAVED THE MOMENT IT IS CHOSEN, not with the form's Save button, because it
 * changes TWO characters: "Paul is Lucy's Dad" also makes Lucy Paul's
 * daughter, and Paul's form is not the one open. A list held in this form and
 * sent on Save could be stale against a mirror written from Paul's side, and
 * would silently undo it -- so the server owns the list and this component
 * only ever asks it to set or clear one pair.
 *
 * A NEW character has no id yet, so its rows wait in `pending` and the form
 * sends them once the character exists (CharacterForm's submit).
 *
 * The labels follow the RELATED character's sex -- Paul is a Dad, not a Mom --
 * which is why the relation picker waits for a character to be chosen first.
 */
export function FamilyEditor({
  savedId,
  name,
  pending,
  onPendingChange,
}: {
  /** The saved character's id; absent while creating. */
  savedId?: string;
  /** The name in the form right now, for "Paul is Lucy's …". */
  name: string;
  pending: CharacterRelation[];
  onPendingChange: (next: CharacterRelation[]) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: characters = [] } = useQuery<Character[]>({ queryKey: ["/api/characters"] });
  const [relativeId, setRelativeId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const byId = new Map(characters.map((c) => [c.id, c]));
  // The LIVE row, so a mirror written from another sheet shows up here.
  const saved = savedId ? byId.get(savedId)?.relations ?? [] : pending;
  // A relation to someone since deleted says nothing; the server tidies it too.
  const rows = saved.filter((r) => byId.has(r.relativeId));
  const whose = name.trim() || "this character";
  const candidates = characters.filter(
    (c) => c.id !== savedId && !rows.some((r) => r.relativeId === c.id),
  );
  const relative = byId.get(relativeId);

  const save = async (otherId: string, relation: Relation | null) => {
    if (!savedId) {
      onPendingChange(
        relation
          ? [...pending.filter((r) => r.relativeId !== otherId), { relativeId: otherId, relation }]
          : pending.filter((r) => r.relativeId !== otherId),
      );
      return;
    }
    setBusy(otherId);
    try {
      if (relation) {
        await apiRequest("PUT", `/api/characters/${savedId}/relations/${otherId}`, { relation });
      } else {
        await apiRequest("DELETE", `/api/characters/${savedId}/relations/${otherId}`);
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/characters"] });
      const other = byId.get(otherId);
      toast({
        title: relation ? "Family saved" : "Removed from family",
        description: other
          ? relation
            ? `${other.name} is ${whose}'s ${relationLabel(relation, other.sex).toLowerCase()}.`
            : `${other.name} and ${whose} are no longer listed as family.`
          : undefined,
      });
    } catch (error) {
      toast({
        title: "That did not save",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Family</h3>
        <p className="text-xs text-muted-foreground">
          Choose from your other characters. Both of them are updated, and a story only mentions
          family who are in it.
        </p>
      </div>

      {rows.length > 0 && (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const other = byId.get(r.relativeId)!;
            return (
              <li key={r.relativeId} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{other.name}</span>
                  <span className="text-muted-foreground"> — {relationLabel(r.relation, other.sex)}</span>
                </span>
                <Button
                  type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                  disabled={busy === r.relativeId}
                  onClick={() => save(r.relativeId, null)}
                  aria-label={`Remove ${other.name} from family`}
                >
                  {busy === r.relativeId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {!savedId && rows.length > 0 && (
        <p className="text-xs text-muted-foreground">Saved when you create {whose}.</p>
      )}

      {candidates.length === 0 ? (
        rows.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Make another character first, and they can be added here.
          </p>
        )
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={relativeId} onValueChange={setRelativeId}>
            <SelectTrigger className="sm:w-48" aria-label="Family member">
              <SelectValue placeholder="Choose a character…" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">is {whose}'s</span>
          <Select
            value=""
            disabled={!relative || busy !== null}
            onValueChange={(v) => {
              if (!relative) return;
              void save(relative.id, v as Relation);
              setRelativeId("");
            }}
          >
            <SelectTrigger className="sm:w-48" aria-label="Relation">
              <SelectValue placeholder={relative ? "Choose…" : "Choose a character first"} />
            </SelectTrigger>
            <SelectContent>
              {RELATIONS.map((r) => (
                <SelectItem key={r} value={r}>{relationLabel(r, relative?.sex)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

/**
 * Animals that are theirs, with their names. Saved with the form.
 *
 * A pet is added whole -- name and kind together, then Add -- rather than as
 * an empty row to fill in, because an empty row is an invalid sheet that
 * refuses to save from a tab the reader may no longer be looking at.
 */
export function PetsEditor({
  value,
  onChange,
}: {
  value: Pet[];
  onChange: (next: Pet[]) => void;
}) {
  const [petName, setPetName] = useState("");
  const [petKind, setPetKind] = useState("");
  const canAdd = petName.trim() && petKind.trim() && value.length < MAX_PETS;

  const add = () => {
    if (!canAdd) return;
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `pet-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    onChange([...value, { id, name: petName.trim(), kind: petKind.trim(), inStories: true }]);
    setPetName("");
    setPetKind("");
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Pets</h3>
        <p className="text-xs text-muted-foreground">
          A ticked pet comes along in stories, by name — even through the lantern. A favourite
          animal on the Personality tab is only something they like.
        </p>
      </div>

      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-md border px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground"> — {p.kind}</span>
              </span>
              <label className="flex shrink-0 items-center gap-1.5 text-xs">
                <Checkbox
                  checked={p.inStories}
                  onCheckedChange={(v) =>
                    onChange(value.map((o) => (o.id === p.id ? { ...o, inStories: v === true } : o)))
                  }
                />
                In stories
              </label>
              <Button
                type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                onClick={() => onChange(value.filter((o) => o.id !== p.id))}
                aria-label={`Remove ${p.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {value.length < MAX_PETS && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <Input
            value={petName}
            maxLength={40}
            onChange={(e) => setPetName(e.target.value)}
            onKeyDown={(e) => {
              // Or Enter submits the whole character.
              if (e.key === "Enter") { e.preventDefault(); add(); }
            }}
            placeholder="Pet's name"
            aria-label="Pet's name"
            className="sm:w-40"
          />
          <div className="min-w-0 flex-1">
            <AnimalAutocomplete
              value={petKind}
              onChange={(v) => setPetKind(v === "none" ? "" : v)}
              placeholder="What kind of animal?"
              allowNone={false}
            />
          </div>
          <Button type="button" variant="outline" disabled={!canAdd} onClick={add} className="shrink-0">
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      )}
    </div>
  );
}
