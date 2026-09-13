/**
 * Take one character back to the beginning, from Settings.
 *
 * A RESET, NOT A RESPEC. The sliders already hand a spent point back when you
 * lower a stat, so "choose again" is something the character form can already
 * do a click at a time. This is the other thing: everything the character has
 * SPENT and everything the character has EARNED, gone, back to a brand-new
 * sheet with the starting points and nothing else.
 *
 * That is why it needs POST /api/characters/:id/reset rather than a normal
 * save. Earned points live in `adventures`, which every other write route omits
 * as server-owned -- a client cannot rewrite what happened by sending a body.
 * The route is the one deliberate exception, so that rule stays absolute
 * everywhere else.
 *
 * IT CANNOT BE UNDONE, and the copy says so in those words. `adventures` is not
 * derived by counting saved stories -- they expire, the ledger outlives them --
 * so there is nothing to rebuild it from. The stories themselves stay in the
 * library; what goes is this character's record of them.
 *
 * The dialog is therefore the whole gate: Settings has no form to hold an
 * unsaved change, so there is no Save to think better at. It names the
 * character and counts what is being taken, rather than asking "are you sure?"
 * about an unnamed thing.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type Character,
  characterKind,
  pointsSpent,
  pointsEarned,
  skillsOf,
  statsOf,
  statsEnabledFor,
} from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

/**
 * What a reset would cost this character.
 *
 * `earned` counts too, and it is the reason this is not just "points spent":
 * a character sitting at the baseline having never spent a thing can still
 * have twenty stories behind it, and the reset takes those. A sheet is only
 * already-at-the-beginning when there is nothing on it AND nothing behind it.
 */
function committed(c: Character) {
  const skills = skillsOf(c);
  return {
    points: pointsSpent(statsOf(c), skills),
    skills: skills.length,
    earned: pointsEarned(c),
    get isFresh() {
      return this.points === 0 && this.skills === 0 && this.earned === 0;
    },
  };
}

export default function ResetSheetCard() {
  const { data: characters = [], isLoading } = useQuery<Character[]>({
    queryKey: ["/api/characters"],
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedId, setSelectedId] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  // A character with the stat system turned off has no sheet to reset, so it is
  // not offered -- rather than offered and then refused, which teaches nothing.
  const eligible = characters.filter(statsEnabledFor);
  const selected = eligible.find((c) => c.id === selectedId);
  const spent = selected ? committed(selected) : null;

  const handleReset = async () => {
    if (!selected) return;
    setResetting(true);
    try {
      // A route of its own, with no body. Clearing `adventures` is the whole
      // point and no client may write that field -- see the route's comment for
      // why that rule stays absolute everywhere else.
      await apiRequest("POST", `/api/characters/${selected.id}/reset`);
      await queryClient.invalidateQueries({ queryKey: ["/api/characters"] });
      toast({
        title: `${selected.name} is starting again`,
        description: "Attributes, skills and earned points are all back to the beginning.",
      });
      setSelectedId("");
    } catch (error) {
      toast({
        title: "Could not reset that character",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setResetting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <Card className="bg-card rounded-2xl shadow-xl">
      <CardHeader>
        <CardTitle className="text-xl font-heading">Start a character's sheet again</CardTitle>
        {/* NO SINGULAR "THEY" ANYWHERE IN THIS CARD. One character is one
            person: it is the name, or the possessive built from the name.
            Written here first because this copy is about exactly one
            character, which is where that mistake gets made. */}
        <CardDescription>
          Take one character back to the beginning: attributes to the middle, no skills,
          and no earned points. The stories stay in your library — what goes is the
          character's record of them, and the virtue levels that came with it. This cannot
          be undone.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <Label htmlFor="reset-character">Character</Label>
        <Select value={selectedId} onValueChange={setSelectedId} disabled={isLoading}>
          <SelectTrigger id="reset-character">
            <SelectValue
              placeholder={
                isLoading
                  ? "Loading characters…"
                  : eligible.length === 0
                    ? "No characters use attributes yet"
                    : "Choose a character"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {eligible.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
                {characterKind(c) ? ` — ${characterKind(c)}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selected && spent && (
          <p className="text-sm text-muted-foreground">
            {spent.isFresh ? (
              <>{selected.name} is already at the beginning — there is nothing to reset.</>
            ) : (
              <>
                {selected.name} has {spent.points} point{spent.points === 1 ? "" : "s"} committed
                {spent.skills > 0 && (
                  <>
                    , including {spent.skills} skill{spent.skills === 1 ? "" : "s"}
                  </>
                )}
                {spent.earned > 0 && (
                  <>
                    , and {spent.earned} point{spent.earned === 1 ? "" : "s"} earned from{" "}
                    {spent.earned === 1 ? "one story" : `${spent.earned} stories`}
                  </>
                )}
                . A reset takes {spent.earned > 0 ? "all of it" : "it back to the beginning"}.
              </>
            )}
          </p>
        )}
      </CardContent>

      <CardFooter className="flex justify-end border-t p-4 bg-muted rounded-b-2xl">
        <Button
          variant="destructive"
          disabled={!selected || !spent || spent.isFresh || resetting}
          onClick={() => setConfirmOpen(true)}
        >
          {resetting ? "Resetting…" : "Reset this character"}
        </Button>
      </CardFooter>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            {/* Named, and counted. "Are you sure?" over an unnamed thing is the
                dialog people learn to dismiss without reading. */}
            <AlertDialogTitle>
              Start {selected?.name ?? "this character"}'s sheet again?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The five attributes go back to the middle and every skill is cleared.
              {(spent?.earned ?? 0) > 0 && (
                <>
                  {" "}
                  The {spent?.earned} point{spent?.earned === 1 ? "" : "s"}{" "}
                  {selected?.name ?? "this character"} earned from{" "}
                  {spent?.earned === 1 ? "a story" : "stories"} are taken away too, along
                  with the virtue levels that came with them. Your saved stories stay in
                  the library.
                </>
              )}{" "}
              This happens straight away and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} disabled={resetting}>
              {resetting ? "Resetting…" : "Reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
