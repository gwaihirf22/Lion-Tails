import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { type Character } from "@shared/schema";
import CharacterForm, { type CharacterFormValues } from "@/components/CharacterForm";
import { saveCharacter } from "@/lib/saveCharacter";
import CharacterCard from "@/components/CharacterCard";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

export default function Characters() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  /**
   * WHICH character is being edited, not a copy of it.
   *
   * It used to hold the row itself, which meant the edit card showed a
   * snapshot taken when it was opened. A picture generated while the tab was
   * closed -- and generation DOES finish without the tab, the server does not
   * abort when the socket does -- landed in the database and never appeared,
   * because invalidating the query refreshed the list behind a card still
   * rendering its own stale copy. Looking it up by id means every refetch
   * reaches the open card.
   */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [characterToDelete, setCharacterToDelete] = useState<Character | null>(null);

  // Fetch all characters
  const { data: characters = [], isLoading } = useQuery<Character[]>({
    queryKey: ['/api/characters'],
    queryFn: getQueryFn<Character[]>({
      on401: "throw"
    }),
    meta: {
      showErrorToast: true
    }
  });

  // Always the CURRENT row for the open card. Undefined once it is deleted,
  // which closes the dialog on its own rather than editing a ghost.
  const editingCharacter = characters.find((c) => c.id === editingId) ?? null;

  // Create a new character
  const createMutation = useMutation({
    mutationFn: ({ values, custom }: { values: CharacterFormValues; custom: boolean }) =>
      saveCharacter(values, custom),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/characters'] });
      setIsCreating(false);
      toast({
        title: "Character created!",
        description: "Your character is ready for a quest with the Timekeeper.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to create character",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    },
  });

  // Update a character
  const updateMutation = useMutation({
    mutationFn: ({ id, values, custom }: { id: string; values: CharacterFormValues; custom: boolean }) =>
      saveCharacter(values, custom, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/characters'] });
      // The dialog STAYS OPEN. Saving is not finishing: a character is built
      // across five tabs, and closing the card on save meant reopening it to
      // carry on -- and reopening it is also the only way to reach the picture
      // button, which needs a saved id to exist. The Save button greys itself
      // out until something changes again, so it is still obvious there is
      // nothing left to save. Closing is the user's to decide.
      toast({
        title: "Character updated!",
        description: "Your character has been successfully updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to update character",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    },
  });

  // Delete a character
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/characters/${id}`)
        .then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/characters'] });
      setDeleteDialogOpen(false);
      setCharacterToDelete(null);
      toast({
        title: "Character deleted",
        description: "Your character has been successfully removed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to delete character",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    },
  });

  const handleCreateCharacter = (values: CharacterFormValues, custom: boolean) => {
    createMutation.mutate({ values, custom });
  };

  const handleEditCharacter = (character: Character) => {
    setEditingId(character.id);
    setIsEditing(true);
  };

  const handleUpdateCharacter = (values: CharacterFormValues, custom: boolean) => {
    if (editingCharacter) {
      return updateMutation.mutateAsync({ id: editingCharacter.id, values, custom });
    }
  };

  const handleDeleteCharacter = (character: Character) => {
    setCharacterToDelete(character);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (characterToDelete) {
      deleteMutation.mutate(characterToDelete.id);
    }
  };

  return (
    <div className="container py-8 max-w-7xl">
      {/* The button is above the description on a phone and beside the
          heading on a desktop -- either way above the text. It used to share a
          line with the paragraph and squeeze it into a narrow column. */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 text-2xl md:text-3xl font-bold">Your Characters</h1>
        
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button>
              <PlusIcon className="h-4 w-4 mr-2" />
              Create Character
            </Button>
          </DialogTrigger>
          {/* Anchored near the top rather than centred. DialogContent is
              top-[50%] translate-y-[-50%] with an intrinsic height, so every
              change in content height moved the panel by half the delta -- and
              this one is TABBED, so switching to a shorter tab slid the whole
              card, tab strip included. Only the dialogs that host tabs need
              this; the other eight call sites are fine centred. */}
            <DialogContent className="max-w-3xl top-[4vh] translate-y-0 max-h-[92dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create a New Character</DialogTitle>
              <DialogDescription>
                Design a character for stories of their own, and for quests with the Timekeeper
              </DialogDescription>
            </DialogHeader>
            <CharacterForm 
              onSubmit={handleCreateCharacter}
              loading={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      <p className="mb-6 text-muted-foreground">
        Anyone you want stories written about. Save them once and reuse them
        across stories — someone you know, or someone invented.
      </p>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="border rounded-lg p-4 h-64 animate-pulse">
              <div className="bg-muted rounded h-6 w-1/3 mb-4"></div>
              <div className="space-y-2">
                <div className="bg-muted rounded h-4 w-full"></div>
                <div className="bg-muted rounded h-4 w-2/3"></div>
                <div className="bg-muted rounded h-4 w-3/4"></div>
                <div className="bg-muted rounded h-4 w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      ) : characters.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {characters.map((character: Character) => (
            <CharacterCard
              key={character.id}
              character={character}
              onEdit={() => handleEditCharacter(character)}
              onDelete={() => handleDeleteCharacter(character)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border rounded-lg bg-muted/10">
          <h3 className="text-xl font-medium mb-2">No characters yet</h3>
          <p className="text-muted-foreground mb-4">
            Create your first character -- for stories of their own, and for quests with the Timekeeper
          </p>
          <Button onClick={() => setIsCreating(true)}>
            Create Your First Character
          </Button>
        </div>
      )}

      {/* Edit Character Dialog */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="max-w-3xl top-[4vh] translate-y-0 max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Character</DialogTitle>
            <DialogDescription>
              Update your character's details
            </DialogDescription>
          </DialogHeader>
          {editingCharacter && (
            <CharacterForm
              onSubmit={handleUpdateCharacter}
              loading={updateMutation.isPending}
              initialCharacter={editingCharacter}
              saved={editingCharacter}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {characterToDelete?.name}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}