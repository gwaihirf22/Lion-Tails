import { type Character, characterKind } from "@shared/schema";
import { categoryOf, type CharacterCategory } from "@shared/characterVocab";
import { cn } from "@/lib/utils";

/**
 * A character's picture, or a stand-in for one.
 *
 * Written before anything can generate an avatar, on purpose: the card and the
 * Basics tab both need somewhere to put it, and laying both of them out twice --
 * once around a gap and again around a picture -- is how the second version
 * ends up looking different from the first.
 *
 * The stand-in is keyed to what they ARE, so a dragon does not get a generic
 * person-shaped silhouette. An empty grey square reads as broken; a dragon
 * reads as "no picture yet", which is the truth.
 */
const PLACEHOLDER: Record<CharacterCategory, string> = {
  human: "🧒",
  mammal: "🐾",
  bird: "🐦",
  reptile: "🦎",
  amphibian: "🐸",
  fish: "🐟",
  insect: "🦋",
  creature: "🐙",
  mythical: "🐉",
  machine: "🤖",
};

export default function CharacterAvatar({
  character,
  size = "md",
  className,
}: {
  character: Pick<Character, "name" | "kind" | "gender" | "category" | "avatarUrl">;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box = { sm: "h-10 w-10 text-xl", md: "h-16 w-16 text-3xl", lg: "h-28 w-28 text-5xl" }[size];
  // The stored category first, then whatever the kind resolves to -- a
  // character a parent typed freely has no category, and "human" is a better
  // guess for an unknown than nothing at all.
  const category = character.category ?? categoryOf(characterKind(character)) ?? "human";

  if (character.avatarUrl) {
    return (
      <img
        src={character.avatarUrl}
        alt={character.name}
        className={cn(box, "rounded-lg object-cover bg-muted", className)}
      />
    );
  }

  return (
    <div
      className={cn(box, "rounded-lg bg-muted flex items-center justify-center select-none", className)}
      // Not aria-hidden: for a character with no picture this emoji IS the only
      // thing standing in for them, so a screen reader should say so.
      role="img"
      aria-label={`${character.name} has no picture yet`}
      title="No picture yet"
    >
      {PLACEHOLDER[category]}
    </div>
  );
}
