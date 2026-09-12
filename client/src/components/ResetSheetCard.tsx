/**
 * Give one character's attributes and skills back, from Settings.
 *
 * WHY THIS EXISTS AT ALL, when the sliders already refund: lowering a stat
 * gives its point back, so a child can walk a sheet down one click at a time.
 * Except when that walk is refused. Parent Mode writes stats WITHOUT spending,
 * on purpose, and the strict save path checks the MERGED sheet -- so on a sheet
 * that is over budget every partial step is still over budget, and each save is
 * refused until the whole thing comes back in line at once. This is that one
 * save. It is also the answer to eleven fiddly clicks when the real wish is
 * "start her again".
 *
 * WHAT IT DOES NOT TOUCH: adventures. That is the record of the stories this
 * character has been through -- it is what EARNED the points, and it drives the
 * virtue levels. Both write routes omit it as server-owned, so this could
 * not clear it even by mistake. A reset hands the points back to be spent
 * again; it does not take a child's stories away.
 *
 * It writes on confirm, with nothing to press afterwards. In the character form
 * a reset could sit in form state and cost nothing until Save, but Settings has
 * no form to hold it -- so the dialog is the whole gate, and it says the
 * character's name and the exact number of points being given back rather than
 * asking "are you sure?" about an unnamed thing.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type Character,
  baseStats,
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

/** How many points this sheet has committed, and to what. */
function committed(c: Character) {
  const skills = skillsOf(c);
  return {
    points: pointsSpent(statsOf(c), skills),
    skills: skills.length,
    /** A sheet nobody has spent on has nothing to give back. */
    get isBaseline() {
      return this.points === 0 && this.skills === 0;
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
      // The strict route, deliberately: a baseline sheet spends nothing, so it
      // is affordable for every character that has ever existed. This needs no
      // Parent Mode and no route of its own.
      await apiRequest("PUT", `/api/characters/${selected.id}`, {
        stats: baseStats(),
        skills: [],
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/characters"] });
      toast({
        title: `${selected.name}'s sheet is back to the start`,
        description: "Those attributes and skills are ready to spend again.",
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
          Hand back every point one character has spent on attributes and skills, so the
          points can be spent again. The stories that character has been in, and the
          points those earned, are not affected.
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
            {spent.isBaseline ? (
              <>{selected.name} has not spent anything yet — there is nothing to give back.</>
            ) : (
              <>
                {selected.name} has {spent.points} point{spent.points === 1 ? "" : "s"} committed
                {spent.skills > 0 && (
                  <>
                    , including {spent.skills} skill{spent.skills === 1 ? "" : "s"}
                  </>
                )}
                . The {pointsEarned(selected)} point
                {pointsEarned(selected) === 1 ? "" : "s"} earned from stories stay
                {pointsEarned(selected) === 1 ? "s" : ""}.
              </>
            )}
          </p>
        )}
      </CardContent>

      <CardFooter className="flex justify-end border-t p-4 bg-muted rounded-b-2xl">
        <Button
          variant="destructive"
          disabled={!selected || !spent || spent.isBaseline || resetting}
          onClick={() => setConfirmOpen(true)}
        >
          {resetting ? "Resetting…" : "Reset attributes and skills"}
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
              The five attributes go back to the middle and every skill is cleared, giving
              back {spent?.points ?? 0} point{spent?.points === 1 ? "" : "s"} to spend again.
              The stories {selected?.name ?? "this character"} has been in, the points those
              earned, and the virtues that came with them all stay. This happens straight
              away.
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
