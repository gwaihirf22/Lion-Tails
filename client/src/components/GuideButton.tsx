import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGuide } from "@/hooks/use-guide";
import type { GuideNodeId, GuideTabId } from "@shared/guide";

/**
 * "How to use", top left of every page the guide covers.
 *
 * Top left rather than beside the heading: Blake asked for one place it always
 * is, and the heading rows here already carry something on the right (the
 * credits box, "Create Character", "Create New Story"), which on a phone wraps.
 *
 * On the reader it goes in the row that carries `.reader-chrome`, so focus mode
 * fades it with everything else -- a help button floating over a faded story
 * would be the one thing left on screen.
 *
 * Renders nothing with no provider above it, which is the public shared-story
 * page: there is nothing to guide there and no account to remember it for.
 */
export default function GuideButton({
  tab,
  node,
  className,
}: {
  tab?: GuideTabId;
  node?: GuideNodeId;
  className?: string;
}) {
  const guide = useGuide();
  if (!guide) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      data-guide="how-to-use"
      className={cn("h-8 gap-1 px-2 text-xs", className)}
      onClick={() => guide.openGuide(tab, node)}
    >
      <HelpCircle className="h-4 w-4" aria-hidden="true" />
      How to use
    </Button>
  );
}
