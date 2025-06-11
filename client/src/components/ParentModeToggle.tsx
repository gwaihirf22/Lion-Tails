import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useParentMode } from "@/hooks/use-parent-mode";
import { Lock, Unlock, Clock, AlertTriangle } from "lucide-react";

export default function ParentModeToggle() {
  const { isActive, expiresAt, verifyPassword, disable } = useParentMode();
  const [password, setPassword] = useState("");
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
    const success = await verifyPassword(password);
    setIsVerifying(false);

    if (success) {
      setPassword("");
      setDialogOpen(false);
    }
  };

  const getTimeRemaining = () => {
    if (!expiresAt) return null;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) return null;
    
    const minutes = Math.floor(remaining / (1000 * 60));
    return minutes;
  };

  const timeRemaining = getTimeRemaining();

  return (
    <Card className="mb-6 border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {isActive ? (
              <Unlock className="h-5 w-5 text-amber-600" />
            ) : (
              <Lock className="h-5 w-5 text-gray-500" />
            )}
            <CardTitle className="text-lg text-amber-800">Parent Mode</CardTitle>
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={handleToggle}
            className="data-[state=checked]:bg-amber-500"
          />
        </div>
        <CardDescription className="text-amber-700">
          Enable advanced prompt editing capabilities for story customization.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-3">
          <div className="text-sm text-amber-700">
            <p className="font-medium mb-2">What Parent Mode enables:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Edit AI prompts before story generation</li>
              <li>Customize both system and user prompts</li>
              <li>Preview prompts with syntax highlighting</li>
              <li>Content validation for child-appropriate content</li>
            </ul>
          </div>

          {isActive && timeRemaining !== null && (
            <Alert className="bg-green-50 border-green-200">
              <Clock className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700">
                Active for {timeRemaining} more minute{timeRemaining !== 1 ? 's' : ''}
              </AlertDescription>
            </Alert>
          )}

          <Alert className="bg-blue-50 border-blue-200">
            <AlertTriangle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-700 text-xs">
              <strong>Important:</strong> Parent Mode requires your account password and automatically expires after 30 minutes for security.
            </AlertDescription>
          </Alert>
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Lock className="h-5 w-5 text-amber-600" />
              <span>Verify Password</span>
            </DialogTitle>
            <DialogDescription>
              Enter your account password to enable Parent Mode for 30 minutes.
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
                className="bg-amber-600 hover:bg-amber-700"
              >
                {isVerifying ? "Verifying..." : "Enable Parent Mode"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}