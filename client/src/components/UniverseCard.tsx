/**
 * One universe in the library: its summary, its canon, and the controls.
 *
 * The Make Summary button is disabled from the SERVER's `canMakeSummary`. That
 * flag is both the "already up to date" rule and the stale badge -- one fact,
 * displayed once, decided once.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, ChevronDown, ChevronRight, Pin, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useParentMode } from "@/hooks/use-parent-mode";
import type { Universe } from "@/hooks/use-universes";

type Props = {
  universe: Universe;
  storyCount: number;
  busy: boolean;
  onMakeSummary: (force?: boolean) => void;
  onEditSummary: (text: string) => Promise<{ ok: boolean; message?: string }>;
  onAddCanon: (text: string) => Promise<{ ok: boolean; message?: string }>;
  onRemoveCanon: (canonId: string) => void;
  onDelete: () => void;
  children?: React.ReactNode;
};

export default function UniverseCard({
  universe,
  storyCount,
  busy,
  onMakeSummary,
  onEditSummary,
  onAddCanon,
  onRemoveCanon,
  onDelete,
  children,
}: Props) {
  const { toast } = useToast();
  const { isActive: parentMode } = useParentMode();
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(universe.summary ?? "");
  const [canonDraft, setCanonDraft] = useState("");

  const activeCanon = universe.pinnedCanon.filter((c) => c.status === "active");
  const proposed = universe.pinnedCanon.filter((c) => c.status === "proposed");

  const save = async () => {
    const r = await onEditSummary(draft);
    if (!r.ok) {
      // Parent Mode expires after 30 minutes; keep the draft rather than
      // discarding what the user typed.
      toast({ title: "Not saved", description: r.message, variant: "destructive" });
      return;
    }
    setEditing(false);
    toast({ title: "Summary saved" });
  };

  return (
    <Card className="bg-card rounded-2xl shadow mb-4">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <button
            className="flex items-center gap-2 text-left"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="text-lg font-heading font-bold text-secondary">{universe.name}</span>
            <span className="text-sm text-muted-foreground">
              {storyCount} {storyCount === 1 ? "story" : "stories"}
            </span>
          </button>

          <div className="flex items-center gap-2 shrink-0">
            {busy && (
              <Badge variant="outline" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> summarising
              </Badge>
            )}
            {!busy && universe.isStale && (
              <Badge variant="outline" className="bg-warning-surface border-warning text-warning">
                summary out of date
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !universe.canMakeSummary}
              onClick={() => onMakeSummary(false)}
              title={
                universe.canMakeSummary
                  ? "Read the stories and update this universe's summary"
                  : storyCount < 2
                    ? "A universe needs at least two stories"
                    : "Already up to date — it unlocks again when a story is added"
              }
            >
              {universe.summary ? "Update summary" : "Make summary"}
            </Button>
          </div>
        </div>

        {open && (
          <div className="mt-4 space-y-4">
            {/* Summary */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-semibold">What has happened so far</h4>
                {universe.summary && parentMode && !editing && (
                  <Button size="sm" variant="ghost" onClick={() => { setDraft(universe.summary ?? ""); setEditing(true); }}>
                    Edit
                  </Button>
                )}
              </div>

              {!universe.summary && (
                <p className="text-sm text-muted-foreground">
                  No summary yet. Once there are two stories, make one — later
                  stories in this universe are written against it.
                </p>
              )}

              {universe.summary && !editing && (
                <p className="text-sm whitespace-pre-wrap">{universe.summary}</p>
              )}

              {editing && (
                <div className="space-y-2">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="min-h-40 bg-card"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={save}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                  </div>
                </div>
              )}

              {universe.summary && (
                <p className="text-xs text-muted-foreground mt-2">
                  {universe.summaryCoveredCount != null && (
                    <>read {universe.summaryCoveredCount} {universe.summaryCoveredCount === 1 ? "story" : "stories"} in full</>
                  )}
                  {universe.summaryDroppedCount ? <>, {universe.summaryDroppedCount} covered by the previous summary</> : null}
                  {universe.summaryModel ? <> · {universe.summaryModel}</> : null}
                  {universe.summaryEditedAt ? <> · edited by hand</> : null}
                </p>
              )}

              {universe.summary && !universe.canMakeSummary && parentMode && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-1 text-xs"
                  disabled={busy}
                  onClick={() => onMakeSummary(true)}
                >
                  Rebuild anyway
                </Button>
              )}
            </div>

            {/* Canon */}
            <div>
              <h4 className="text-sm font-semibold mb-1 flex items-center gap-1">
                <Pin className="h-3 w-3" /> Things that must never be forgotten
              </h4>
              {activeCanon.length === 0 && proposed.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nothing pinned. Pinned facts are sent with every story in this
                  universe and are never summarised away.
                </p>
              )}
              <ul className="space-y-1">
                {activeCanon.map((c) => (
                  <li key={c.id} className="text-sm flex items-start gap-2">
                    <span className="flex-1">{c.text}</span>
                    {parentMode && (
                      <button onClick={() => onRemoveCanon(c.id)} title="Unpin">
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {proposed.length > 0 && (
                <div className="mt-2 rounded-md bg-muted/40 p-2">
                  <p className="text-xs text-muted-foreground mb-1">
                    Suggested by the last summary. These are <strong>not</strong> used
                    until you pin them — the model does not get to decide what is
                    permanently true.
                  </p>
                  <ul className="space-y-1">
                    {proposed.map((c) => (
                      <li key={c.id} className="text-sm flex items-start gap-2">
                        <span className="flex-1 text-muted-foreground">{c.text}</span>
                        {parentMode && (
                          <>
                            <button
                              className="text-xs underline"
                              onClick={async () => {
                                const r = await onAddCanon(c.text);
                                if (r.ok) onRemoveCanon(c.id);
                                else toast({ title: "Not pinned", description: r.message, variant: "destructive" });
                              }}
                            >
                              pin
                            </button>
                            <button onClick={() => onRemoveCanon(c.id)} title="Discard">
                              <X className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {parentMode && (
                <div className="flex gap-2 mt-2">
                  <Input
                    value={canonDraft}
                    onChange={(e) => setCanonDraft(e.target.value)}
                    placeholder="e.g. Mia's grandmother gave her the brass lantern"
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const r = await onAddCanon(canonDraft);
                      if (r.ok) setCanonDraft("");
                      else toast({ title: "Not pinned", description: r.message, variant: "destructive" });
                    }}
                  >
                    Pin
                  </Button>
                </div>
              )}
              {!parentMode && (
                <p className="text-xs text-muted-foreground mt-2">
                  Editing the summary and pinning facts need Parent Mode — they
                  change what every future story here is written against.
                </p>
              )}
            </div>

            {children}

            <div className="pt-2 border-t">
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive text-xs"
                onClick={onDelete}
                title="The stories are kept — they move back to Unassigned"
              >
                Delete universe (keeps the stories)
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
