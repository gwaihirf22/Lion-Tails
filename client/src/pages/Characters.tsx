import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { type Character } from "@shared/schema";
import CharacterForm from "@/components/CharacterForm";
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
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
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

  // Create a new character
  const createMutation = useMutation({
    mutationFn: (character: Omit<Character, "id" | "createdAt">) =>
      apiRequest("POST", '/api/characters', character)
        .then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/characters'] });
      setIsCreating(false);
      toast({
        title: "Character created!",
        description: "Your character is ready for time travel adventures.",
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
    mutationFn: ({id, character}: {id: string, character: Partial<Character>}) =>
      apiRequest("PUT", `/api/characters/${id}`, character)
        .then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/characters'] });
      setIsEditing(false);
      setEditingCharacter(null);
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

  const handleCreateCharacter = (data: Omit<Character, "id" | "createdAt">) => {
    createMutation.mutate(data);
  };

  const handleEditCharacter = (character: Character) => {
    setEditingCharacter(character);
    setIsEditing(true);
  };

  const handleUpdateCharacter = (data: Omit<Character, "id" | "createdAt">) => {
    if (editingCharacter) {
      updateMutation.mutate({
        id: editingCharacter.id,
        character: data,
      });
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
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Your Time Travelers</h1>
          <p className="text-muted-foreground mt-1">
            Create characters who can explore biblical times in your stories
          </p>
        </div>
        
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button>
              <PlusIcon className="h-4 w-4 mr-2" />
              Create Character
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create a New Character</DialogTitle>
              <DialogDescription>
                Design your time traveler to journey through biblical stories
              </DialogDescription>
            </DialogHeader>
            <CharacterForm 
              onSubmit={handleCreateCharacter}
              loading={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

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
            Create your first time traveler to take on adventures through Bible stories
          </p>
          <Button onClick={() => setIsCreating(true)}>
            Create Your First Character
          </Button>
        </div>
      )}

      {/* Edit Character Dialog */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Character</DialogTitle>
            <DialogDescription>
              Update your time traveler's details
            </DialogDescription>
          </DialogHeader>
          {editingCharacter && (
            <CharacterForm
              onSubmit={handleUpdateCharacter}
              loading={updateMutation.isPending}
              initialCharacter={editingCharacter}
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