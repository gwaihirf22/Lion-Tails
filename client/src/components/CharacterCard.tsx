import { type Character } from "@shared/schema";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, BookOpenIcon, HeartIcon, PencilIcon, TrashIcon } from "lucide-react";

interface CharacterCardProps {
  character: Character;
  onSelect?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  selected?: boolean;
}

export default function CharacterCard({ 
  character, 
  onSelect,
  onEdit,
  onDelete,
  selected = false
}: CharacterCardProps) {
  return (
    <Card className={`transition-all duration-200 ${selected ? 'ring-2 ring-primary' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <CardTitle className="text-xl">{character.name}</CardTitle>
          <Badge variant={character.gender === "boy" ? "default" : "secondary"}>
            {character.gender === "boy" ? "Boy" : "Girl"}
          </Badge>
        </div>
        <CardDescription className="flex items-center gap-1">
          <CalendarIcon className="h-3.5 w-3.5" />
          <span>Age: {character.age}</span>
        </CardDescription>
      </CardHeader>
      
      <CardContent className="pb-2">
        <div className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div>
              <span className="font-medium">Hair:</span> {character.hair}
            </div>
            <div>
              <span className="font-medium">Eyes:</span> {character.eyes}
            </div>
            <div>
              <span className="font-medium">Favorite color:</span> {character.favoriteColor}
            </div>
            <div>
              <span className="font-medium">Favorite animal:</span> {character.favoriteAnimal || "None"}
            </div>
            <div>
              <span className="font-medium">Hobby:</span> {character.hobby || "None"}
            </div>
            <div>
              <span className="font-medium">Personality:</span> {character.personality || "None"}
            </div>
          </div>

          <div>
            <span className="font-medium">Special power:</span> {character.specialPower || "None"}
          </div>

          <div className="flex items-center gap-1 mt-2">
            <BookOpenIcon className="h-4 w-4" />
            <span className="font-medium">Time travel experience:</span> {character.timeTravelExperience}/10
          </div>
        </div>
      </CardContent>
      
      <CardFooter className="flex justify-between pt-2">
        {onSelect && (
          <Button onClick={onSelect} variant="default" className="flex-1 mr-2">
            <HeartIcon className="h-4 w-4 mr-2" />
            Select
          </Button>
        )}
        
        <div className="flex gap-2">
          {onEdit && (
            <Button onClick={onEdit} variant="outline" size="icon">
              <PencilIcon className="h-4 w-4" />
            </Button>
          )}
          {onDelete && (
            <Button onClick={onDelete} variant="destructive" size="icon">
              <TrashIcon className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}