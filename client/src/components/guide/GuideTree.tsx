import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { guideTree, NEEDS_LABEL, type GuideNodeId, type GuideTabId, type GuideTreeNode } from "@shared/guide";
import GuideShot from "./GuideShot";

/**
 * The upside-down tree: the root at the top, branches growing down.
 *
 * ONE COLUMN AT EVERY WIDTH, nested lists with the connectors drawn by
 * borders -- a rail down each list (`border-l`) and an elbow into each item
 * (`border-t`). No SVG and nothing measured in JavaScript, so it cannot
 * disagree with the layout it is drawn over.
 *
 * THE INDENT IS CAPPED AT THREE STEPS. The quests branch runs six deep, and
 * six steps of 16px would push its titles off a 390px screen. Past the third
 * step the elbows still say what belongs to what.
 *
 * ONE ITEM OPEN AT A TIME, its detail inline underneath. That is what keeps a
 * tab to one screenshot in the DOM however many nodes it has, and it reads as
 * a tree rather than a wall of pictures.
 */
const INDENT_STEPS = 3;
const STEP_PX = 14;

export default function GuideTree({
  tab,
  openNode,
}: {
  tab: GuideTabId;
  /** Opened when the guide is asked for a particular thing. */
  openNode?: GuideNodeId;
}) {
  const [selected, setSelected] = useState<string | undefined>(openNode);
  const roots = guideTree(tab);

  const branch = (entries: GuideTreeNode[], depth: number) => (
    <ul
      className={cn("m-0 min-w-0 list-none space-y-1 p-0", depth > 0 && "border-l border-border")}
      style={depth > 0 ? { marginLeft: Math.min(depth, INDENT_STEPS) * STEP_PX } : undefined}
    >
      {entries.map((entry) => {
        const open = selected === entry.node.id;
        return (
          <li key={entry.node.id} className={cn("relative pl-2", depth > 0 && "before:absolute before:left-0 before:top-4 before:w-2 before:border-t before:border-border")}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setSelected(open ? undefined : entry.node.id)}
              className={cn(
                "flex w-full items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-left",
                "hover:border-primary/50",
                open && "border-primary/60",
              )}
            >
              <ChevronDown
                className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{entry.node.title}</span>
                {!open && <span className="block truncate text-xs text-muted-foreground">{entry.node.why}</span>}
              </span>
            </button>

            {open && (
              <div className="mb-2 mt-1 space-y-2 rounded-md border border-border bg-muted/40 p-3">
                <p className="m-0 text-sm">{entry.node.why}</p>
                {entry.node.needs && (
                  <p className="m-0 text-xs text-muted-foreground">{NEEDS_LABEL[entry.node.needs]}</p>
                )}
                <GuideShot node={entry.node} />
              </div>
            )}

            {entry.children.length > 0 && branch(entry.children, depth + 1)}
          </li>
        );
      })}
    </ul>
  );

  return branch(roots, 0);
}
