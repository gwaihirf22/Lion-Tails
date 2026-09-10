/**
 * What a universe knows, in three sections that open when asked.
 *
 * This was UniverseCard: every section open at once, inline on My Stories,
 * for every universe, on every tab. The sections are unchanged -- the
 * summary and its Parent-Mode editor, the pinned canon and its pin form,
 * the world memory in the three grades the PROMPT uses -- but each is now a
 * real Collapsible, closed until wanted, on the universe's own page.
 *
 * Parent-Mode gating is exactly as it was: the controls appear only when it
 * is on, and the routes they call carry requireParentMode regardless of
 * what the page shows.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Pin, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useParentMode } from "@/hooks/use-parent-mode";
import type { Universe } from "@/hooks/use-universes";

type Props = {
  universe: Universe;
  busy: boolean;
  onMakeSummary: (force?: boolean) => void;
  onEditSummary: (text: string) => Promise<{ ok: boolean; message?: string }>;
  onAddCanon: (text: string) => Promise<{ ok: boolean; message?: string }>;
  onRemoveCanon: (canonId: string) => void;
};

/** One collapsible section: a heading row that is the trigger. */
export function Section({
  title,
  icon,
  hint,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  /** A word or two beside the title while closed, so a closed section still says something. */
  hint?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-border bg-card">
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center gap-2 p-3 text-left" aria-expanded={open}>
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          {icon}
          <span className="text-sm font-semibold">{title}</span>
          {!open && hint && <span className="ml-auto text-xs text-muted-foreground">{hint}</span>}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 pl-9">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export default function UniverseDetails({
  universe,
  busy,
  onMakeSummary,
  onEditSummary,
  onAddCanon,
  onRemoveCanon,
}: Props) {
  const { toast } = useToast();
  const { isActive: parentMode } = useParentMode();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(universe.summary ?? "");
  const [canonDraft, setCanonDraft] = useState("");

  const activeCanon = universe.pinnedCanon.filter((c) => c.status === "active");
  const proposed = universe.pinnedCanon.filter((c) => c.status === "proposed");
  const world = (universe.worldState ?? []).filter((e) => e.status === "current");

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
    <div className="space-y-3">
      {/* Summary */}
      <Section title="What has happened so far" hint={universe.summary ? undefined : "no summary yet"}>
        <div className="flex items-center justify-end mb-1">
          {universe.summary && parentMode && !editing && (
            <Button size="sm" variant="ghost" onClick={() => { setDraft(universe.summary ?? ""); setEditing(true); }}>
              Edit
            </Button>
          )}
        </div>

        {!universe.summary && (
          <p className="text-sm text-muted-foreground">
            No summary yet. It is written after the second story here, and
            refreshed by every one after that — later stories in this universe
            are written against it.
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
      </Section>

      {/* Canon */}
      <Section
        title="Things that must never be forgotten"
        icon={<Pin className="h-3 w-3 shrink-0" />}
        hint={activeCanon.length ? `${activeCanon.length} pinned` : "nothing pinned"}
      >
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
      </Section>

      {/* World memory: what the stories established, kept current as each is
          written. Grouped the way the PROMPT grades them -- who exists, what
          is fixed, what is still open -- so what a reader sees here is what
          the next story will actually be told. */}
      <Section
        title="What the stories established"
        hint={world.length ? `${world.length} ${world.length === 1 ? "thing" : "things"}` : "nothing yet"}
      >
        {world.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing yet. This fills in on its own as stories are written here.
          </p>
        )}
        <div className="space-y-3">
          {([
            ["character", "Who is in this world"],
            ["fact", "What is already true"],
            ["thread", "Left open"],
          ] as const).map(([kind, heading]) => {
            const items = world.filter((e) => e.kind === kind);
            if (items.length === 0) return null;
            return (
              <div key={kind}>
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {heading}
                </h4>
                <ul className="mt-1 space-y-0.5">
                  {items.map((e) => (
                    <li key={e.id} className="text-sm">{e.text}</li>
                  ))}
                </ul>
              </div>
            );
          })}
          {world.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Updated automatically as stories are added. &ldquo;Left open&rdquo; is
              offered to a later story as a possibility, never as an instruction.
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}
