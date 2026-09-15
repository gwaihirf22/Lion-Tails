import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ParentModeUnlockDialog from "@/components/ParentModeUnlockDialog";
import { useParentMode } from "@/hooks/use-parent-mode";
import { Lock, Unlock, Clock, AlertTriangle } from "lucide-react";

/**
 * Parent Mode: password-gated editing -- prompts, a story's text, a
 * universe's name and summary -- for 30 minutes, or until turned off.
 *
 * "Keep it on" is a checkbox at the password prompt, chosen each time, never a
 * setting: a forgotten setting on a shared device is Parent Mode for the
 * children. It lasts until turned off or signed out; the login itself lapses
 * after a week away, and the copy says so. The prompt itself is
 * ParentModeUnlockDialog, shared with the story Edit button.
 *
 * Lives in Settings. It was previously a full-width warning-coloured card
 * pinned under the Create Story form, which meant every visit to the page it
 * did not apply to began with a large yellow box about a feature most people
 * never turn on. It is an account setting and it sits with the others.
 */
export default function ParentModeToggle() {
  const { isActive, expiresAt, indefinite, disable } = useParentMode();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleToggle = async () => {
    if (isActive) {
      disable();
    } else {
      setDialogOpen(true);
    }
  };

  // Minutes left in the window. Not computed for an indefinite session --
  // there is no window to count down.
  const getTimeRemaining = () => {
    if (indefinite || !expiresAt) return null;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) return null;
    return Math.floor(remaining / (1000 * 60));
  };

  const timeRemaining = getTimeRemaining();

  return (
    <Card className="border-warning bg-warning-surface">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {isActive ? (
              <Unlock className="h-5 w-5 text-warning" />
            ) : (
              <Lock className="h-5 w-5 text-muted-foreground" />
            )}
            <CardTitle className="text-lg text-warning">Parent Mode</CardTitle>
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={handleToggle}
            className="data-[state=checked]:bg-warning"
          />
        </div>
        <CardDescription className="text-warning">
          Editing a story, a universe or the prompts asks for your password first.
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-3">
          <div className="text-sm text-warning">
            <p className="font-medium mb-2">What Parent Mode enables:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Edit a story's title and text (its Edit button asks for this password when Parent Mode is off)</li>
              <li>Rename a universe, edit its summary, pin what must never be forgotten</li>
              <li>Share a story by link, for someone without an account to read</li>
              <li>Edit AI prompts before story generation</li>
            </ul>
          </div>

          {isActive && indefinite && (
            <Alert className="bg-success-surface border-success">
              <Clock className="h-4 w-4 text-success" />
              <AlertDescription className="text-success">
                On until you turn it off or sign out.
              </AlertDescription>
            </Alert>
          )}
          {isActive && !indefinite && timeRemaining !== null && (
            <Alert className="bg-success-surface border-success">
              <Clock className="h-4 w-4 text-success" />
              <AlertDescription className="text-success">
                Active for {timeRemaining} more minute{timeRemaining !== 1 ? "s" : ""}
              </AlertDescription>
            </Alert>
          )}

          <Alert className="bg-muted border-border">
            <AlertTriangle className="h-4 w-4 text-foreground" />
            <AlertDescription className="text-foreground text-xs">
              <strong>Important:</strong> Parent Mode needs your account password. It turns
              itself off after 30 minutes unless you choose to keep it on — and then it stays
              on until you turn it off or sign out.
            </AlertDescription>
          </Alert>
        </div>
      </CardContent>

      <ParentModeUnlockDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </Card>
  );
}
