/**
 * Make one character's next quest a first visit again, from Settings.
 *
 * A sibling of ResetSheetCard and deliberately not a second button on it.
 * Blake: "that is tied to attributes/skills and they need to be 2 separate
 * things." They are also for different people: the sheet reset is offered only
 * to a character with the stat system on, and a character with it off still
 * goes on quests -- so this card offers everyone.
 *
 * The count is not on the character row: it is derived from the library, so
 * the card asks GET /api/characters/quests for it. That is also why the reset
 * cannot clear it and stamps a date instead; the stories stay exactly where
 * they are.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { characterKind, type Character } from "@shared/schema";
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

export default function ResetQuestsCard() {
  const { data: characters = [], isLoading } = useQuery<Character[]>({
    queryKey: ["/api/characters"],
  });
  const { data: quests = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/characters/quests"],
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const selected = characters.find((c) => c.id === selectedId);
  const been = selected ? (quests[selected.id] ?? 0) : 0;

  const handleReset = async () => {
    if (!selected) return;
    setResetting(true);
    try {
      await apiRequest("POST", `/api/characters/${selected.id}/reset-quests`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/characters"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/characters/quests"] }),
      ]);
      toast({
        title: `${selected.name}'s next quest is a first visit`,
        description: "The shop, the lantern and Mr Barnabas will all be new again.",
      });
      setSelectedId("");
    } catch (error) {
      toast({
        title: "Could not reset those quests",
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
        <CardTitle className="text-xl font-heading">Make the next quest a first visit</CardTitle>
        {/* One character is one person: the name, or the possessive built
            from it -- never a singular "they". Same rule as ResetSheetCard. */}
        <CardDescription>
          A character who has been on quests is greeted as someone who knows the shop. This
          makes the next one a first visit again — the shop, the lantern and Mr Barnabas all
          new. Attributes, skills and earned points are not touched, and the stories stay in
          your library. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Label htmlFor="reset-quests-character">Character</Label>
        <Select value={selectedId} onValueChange={setSelectedId} disabled={isLoading}>
          <SelectTrigger id="reset-quests-character">
            <SelectValue
              placeholder={
                isLoading ? "Loading characters…" : characters.length === 0 ? "No characters yet" : "Choose a character"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {characters.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
                {characterKind(c) ? ` — ${characterKind(c)}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected && (
          <p className="text-sm text-muted-foreground">
            {been === 0 ? (
              <>{selected.name} has not been on a quest yet — the next one is already a first visit.</>
            ) : (
              <>
                {selected.name} has been on {been} quest{been === 1 ? "" : "s"}. After this, the next
                one is a first visit.
              </>
            )}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex justify-end border-t p-4 bg-muted rounded-b-2xl">
        <Button
          variant="destructive"
          disabled={!selected || been === 0 || resetting}
          onClick={() => setConfirmOpen(true)}
        >
          {resetting ? "Resetting…" : "Reset quests"}
        </Button>
      </CardFooter>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Make {selected?.name ?? "this character"}'s next quest a first visit?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selected?.name ?? "This character"} has been on {been} quest{been === 1 ? "" : "s"}.
              The next one will open as if none of them had happened. Nothing on the sheet
              changes and the stories stay in the library. This happens straight away and cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} disabled={resetting}>
              {resetting ? "Resetting…" : "Reset quests"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
