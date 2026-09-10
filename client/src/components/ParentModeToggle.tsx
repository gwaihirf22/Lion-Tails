import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useParentMode } from "@/hooks/use-parent-mode";
import { Lock, Unlock, Clock, AlertTriangle } from "lucide-react";

/**
 * Parent Mode: password-gated editing -- prompts, a story's text, a
 * universe's name and summary -- for 30 minutes, or until turned off.
 *
 * "Keep it on" is a checkbox at the password prompt, chosen each time, never a
 * setting: a forgotten setting on a shared device is Parent Mode for the
 * children. It lasts until turned off or signed out; the login itself lapses
 * after a week away, and the copy says so.
 *
 * Lives in Settings. It was previously a full-width warning-coloured card
 * pinned under the Create Story form, which meant every visit to the page it
 * did not apply to began with a large yellow box about a feature most people
 * never turn on. It is an account setting and it sits with the others.
 */
export default function ParentModeToggle() {
  const { isActive, expiresAt, indefinite, verifyPassword, disable } = useParentMode();
  const [password, setPassword] = useState("");
  const [keep, setKeep] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleToggle = async () => {
    if (isActive) {
      disable();
    } else {
      setDialogOpen(true);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsVerifying(true);
    const success = await verifyPassword(password, keep);
    setIsVerifying(false);

    if (success) {
      setPassword("");
      setKeep(false);
      setDialogOpen(false);
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
          Edit what the app wrote: a story's text, a universe's name and summary, the prompts.
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-3">
          <div className="text-sm text-warning">
            <p className="font-medium mb-2">What Parent Mode enables:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Edit a story's title and text from its page</li>
              <li>Rename a universe, edit its summary, pin what must never be forgotten</li>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Lock className="h-5 w-5 text-warning" />
              <span>Verify Password</span>
            </DialogTitle>
            <DialogDescription>
              Enter your account password to turn Parent Mode on for 30 minutes, or until you
              turn it off.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <Label htmlFor="password">Account Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={isVerifying}
                autoFocus
              />
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="keep-parent-mode"
                checked={keep}
                onCheckedChange={(v) => setKeep(v === true)}
                disabled={isVerifying}
                className="mt-0.5"
              />
              <div className="space-y-1 leading-none">
                <Label htmlFor="keep-parent-mode" className="text-sm font-medium">
                  Keep it on until I turn it off or sign out
                </Label>
                <p className="text-xs text-muted-foreground">
                  Otherwise it turns itself off after 30 minutes. On a shared device, leave
                  this unticked.
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={isVerifying}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!password.trim() || isVerifying}
                className="bg-warning hover:bg-warning"
              >
                {isVerifying ? "Verifying..." : "Turn Parent Mode on"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
