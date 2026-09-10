import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Universe } from "@/hooks/use-universes";

/**
 * A universe as one card: name, how many stories, two lines of summary.
 *
 * That is all, on purpose. The old card opened five sections at once --
 * world memory, the summary and its editor, canon and its pin form, the
 * story list, a delete footer -- on every tab, for every universe, and the
 * page was mostly universe. Everything it showed is still there, on the
 * universe's own page, behind sections that open when asked.
 *
 * `storyCount` is DERIVED by the page from the stories it can see, never
 * `universe.storyCount`: the server counts every row, the library hides
 * expired ones, and "3 stories" over a list of 2 is the kind of wrong that
 * looks like a bug in the list.
 */
export default function UniverseSummaryCard({
  universe,
  storyCount,
  busy,
}: {
  universe: Universe;
  storyCount: number;
  busy: boolean;
}) {
  return (
    <Link href={`/universes/${universe.universeId}`} className="block">
      <Card className="bg-card overflow-hidden transition-all duration-200 hover:shadow-md cursor-pointer">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-xl font-bold text-primary line-clamp-1">{universe.name}</h3>
              <p className="text-sm text-muted-foreground">
                {storyCount} {storyCount === 1 ? "story" : "stories"}
              </p>
            </div>
            {busy && (
              <Badge variant="secondary" className="shrink-0">
                summarising…
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
            {universe.summary ? universe.summary : "No summary yet."}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
