import { BookOpen } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { useUniverses, type Universe } from "@/hooks/use-universes";

/**
 * "What has happened in this world so far", as one accordion item.
 *
 * Lifted out of ContinuationContext verbatim so the Create Story page can show
 * it for a story ADDED to a universe as well as one continued inside it. One
 * item, two panels; the continuation panel is byte-identical.
 */
export function UniverseWorldItem({ universe }: { universe: Universe }) {
  if (!universe.summary) return null;
  return (
    <AccordionItem value="world">
      <AccordionTrigger className="text-sm">
        What has happened in this world so far
        {universe.isStale && (
          <Badge variant="outline" className="ml-2 text-xs">
            out of date
          </Badge>
        )}
      </AccordionTrigger>
      <AccordionContent>
        <p className="whitespace-pre-wrap text-sm">{universe.summary}</p>
        {universe.isStale && (
          <p className="mt-2 text-xs text-muted-foreground">
            Stories have been added since this was written, so it does not
            cover all of them. You can update it from My Stories.
          </p>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

/**
 * What a story added to a universe is written against, shown on Create Story.
 *
 * Display only, and free: the summary and the world memory already exist.
 * Nothing here gates the form.
 */
export default function UniverseContext({ universeId }: { universeId: string }) {
  const { universes } = useUniverses();
  const universe = universes.find((u) => u.universeId === universeId);
  if (!universe) return null;

  const world = (universe.worldState ?? []).filter((e) => e.status === "current");

  return (
    <div className="mb-4 rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
        <BookOpen className="h-4 w-4 shrink-0 self-center text-primary" aria-hidden="true" />
        <span className="text-sm">Writing in</span>
        <strong className="text-sm">{universe.name}</strong>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        A new story in this world. It is written against what has already happened
        here, and what happens in it will be remembered for the next one.
      </p>
      <Accordion type="multiple">
        <UniverseWorldItem universe={universe} />
        {world.length > 0 && (
          <AccordionItem value="memory">
            <AccordionTrigger className="text-sm">What the stories established</AccordionTrigger>
            <AccordionContent>
              <ul className="ml-5 list-disc space-y-1 text-sm">
                {world.map((e) => (
                  <li key={e.id}>{e.text}</li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
}
