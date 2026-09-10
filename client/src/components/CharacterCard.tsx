import {
  unseenVirtues,
  statsEnabledFor,
  pointsAvailable, type Character, characterKind } from "@shared/schema";
import { coveringNoun } from "@shared/characterVocab";
import CharacterAvatar from "./CharacterAvatar";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
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
  // Stats switched off means nothing to spend, not a badge saying otherwise.
  const unspent = statsEnabledFor(character) ? Math.max(0, pointsAvailable(character)) : 0;
  const unseen = unseenVirtues(character).length;

  const rows = ([
    [title(coveringNoun(character.category, kind)), character.hair],
    ["Eyes", character.eyes],
    ["Favourite colour", character.favoriteColor],
    ["Favourite animal", character.favoriteAnimal],
    ["Likes", character.hobby],
    ["Personality", character.personality],
  ] as const).filter((r): r is readonly [string, string] => Boolean(r[1]));

  return (
    <Card className={cn("relative transition-all duration-200", selected && "ring-2 ring-primary")}>
      {/*
        ON THE EDGE, like the tab badges, and for the same reason: a count
        tucked inside the header reads as another label. Sitting proud of the
        corner it reads as a notification.

        Each carries a ring in the card's own colour so the overlap looks like
        a deliberate stack rather than two things colliding, and the later one
        in the DOM paints on top -- which is why the red one is last.
      */}
      {(unspent > 0 || unseen > 0) && (
        <TooltipProvider>
          <div className="absolute -right-2 -top-2 z-10 flex -space-x-1.5">
            {unseen > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-tab-virtues px-1.5 text-xs font-semibold text-foreground ring-2 ring-card">
                    {unseen}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {unseen} new virtue{unseen === 1 ? "" : "s"} to look at
                </TooltipContent>
              </Tooltip>
            )}
            {unspent > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground ring-2 ring-card">
                    {unspent}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {unspent} Attribute/Skill point{unspent === 1 ? "" : "s"}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      )}
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <CharacterAvatar character={character} size="md" />
            <CardTitle className="text-xl truncate">{character.name}</CardTitle>
          </div>
          {/* Whatever they are. The badge used to read the gender and print
              "Girl" for anything that was not the string "boy" -- which, once a
              character could be a dragon, was most of them. */}
          {kind && <Badge variant="secondary" className="shrink-0">{title(kind)}</Badge>}
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