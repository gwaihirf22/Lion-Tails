import { type Character, characterKind } from "@shared/schema";
import { coveringNoun } from "@shared/characterVocab";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, HeartIcon, PencilIcon, TrashIcon } from "lucide-react";

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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
  const kind = characterKind(character);
  // The covering noun follows what they are, so a dragon's card says "Scales"
  // where a child's says "Hair". A character saved before categories existed
  // has none, and falls through to "hair" exactly as the story prompt does.
  const rows = ([
    [title(coveringNoun(character.category, kind)), character.hair],
    ["Eyes", character.eyes],
    ["Favourite colour", character.favoriteColor],
    ["Favourite animal", character.favoriteAnimal],
    ["Likes", character.hobby],
    ["Personality", character.personality],
  ] as const).filter((r): r is readonly [string, string] => Boolean(r[1]));

  return (
    <Card className={`transition-all duration-200 ${selected ? 'ring-2 ring-primary' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <CardTitle className="text-xl">{character.name}</CardTitle>
          {/* Whatever they are. The badge used to read the gender and print
              "Girl" for anything that was not the string "boy" -- which, once a
              character could be a dragon, was most of them. */}
          {kind && <Badge variant="secondary">{title(kind)}</Badge>}
        </div>
        {character.age != null && (
          <CardDescription className="flex items-center gap-1">
            <CalendarIcon className="h-3.5 w-3.5" />
            <span>Age: {character.age}</span>
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="pb-2">
        <div className="space-y-2 text-sm">
          {/* Only what they were actually given.
              "Favorite animal: None" was the defaults trap wearing its display
              clothes: six rows every character had, three of them asserting a
              brown-haired blue-eyed answer nobody chose, and three admitting
              they had nothing to say. A character with two facts shows two. */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {rows.map(([label, value]) => (
              <div key={label}>
                <span className="font-medium">{label}:</span> {value}
              </div>
            ))}
          </div>
          {character.notes && (
            <p className="text-muted-foreground pt-1">{character.notes}</p>
          )}
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