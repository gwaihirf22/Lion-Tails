import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import type { SavedStory } from "@shared/schema";
import { EDITED_BY_PARENT } from "@shared/editLog";

/**
 * A story as one line: where a list of stories sits inside something else --
 * a character's sheet, a hero's dialog -- and a card would be the wrong tool.
 *
 * StoryCard navigates on click, owns two portalled dialogs, and carries a
 * favourite/remove/delete cluster. Inside an open Dialog that is a nested
 * modal, a route change under a half-edited form, and three buttons that mean
 * nothing there. This row has none of that: a thumbnail if the story has one,
 * the title as the app's one story link, when it was written, and whether a
 * parent has changed it. Nothing on the row itself is clickable except the
 * title, so it is safe inside a <form>.
 */
export default function StoryRow({ story }: { story: SavedStory }) {
  const imageUrl = story.story.imageUrl;
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card p-2">
      {imageUrl ? (
        <img src={imageUrl} alt="" loading="lazy" className="h-10 w-[3.75rem] shrink-0 rounded object-cover" />
      ) : (
        <div className="h-10 w-[3.75rem] shrink-0 rounded bg-muted" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <Link href={`/story?id=${story.id}`} className="block truncate text-sm font-medium text-primary hover:underline">
          {story.story.title}
        </Link>
        <p className="text-xs text-muted-foreground">
          Created {formatDistanceToNow(new Date(story.createdAt))} ago
          {story.editLog && story.editLog.length > 0 ? ` · ${EDITED_BY_PARENT}` : ""}
        </p>
      </div>
    </div>
  );
}
