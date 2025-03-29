import { Router, Request, Response } from "express";
import { 
  registerUser, 
  loginUser, 
  verifyEmail, 
  requestPasswordReset, 
  resetPassword 
} from "../lib/auth";
import { 
  authenticate, 
  requireAuth, 
  validateBody 
} from "../lib/middleware";
import { 
  loginUserSchema, 
  registerUserSchema, 
  resetPasswordRequestSchema, 
  resetPasswordSchema, 
  verifyEmailSchema 
} from "@shared/schema";
import { storage } from "../storage";

const router = Router();

// Apply authenticate middleware to all routes
router.use(authenticate);

// Register a new user
router.post(
  "/register", 
  validateBody(registerUserSchema), 
  async (req: Request, res: Response) => {
    try {
      const { user, token } = await registerUser(req.body);
      
      // Set token in cookies or session for secure usage
      if (req.session) {
        req.session.token = token;
      }
      
      // Remove sensitive information before sending response
      const { password, ...userWithoutPassword } = user;
      
      return res.status(201).json({ 
        user: userWithoutPassword, 
        token,
        message: "Registration successful! Please check your email to verify your account."
      });
    } catch (error) {
      console.error("Registration error:", error);
      return res.status(400).json({ 
        error: (error as Error).message || "Registration failed"
      });
    }
  }
);

// Login a user
router.post(
  "/login", 
  validateBody(loginUserSchema), 
  async (req: Request, res: Response) => {
    try {
      const { user, token } = await loginUser(req.body);
      
      // Set token in cookies or session for secure usage
      if (req.session) {
        req.session.token = token;
      }
      
      // Remove sensitive information before sending response
      const { password, ...userWithoutPassword } = user;
      
      return res.status(200).json({ 
        user: userWithoutPassword, 
        token
      });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(401).json({ 
        error: "Invalid credentials"
      });
    }
  }
);

// Logout a user
router.post("/logout", (req: Request, res: Response) => {
  // Clear session token if exists
  if (req.session) {
    req.session.token = undefined;
  }
  
  // Clear auth cookie if exists
  res.clearCookie("authToken");
  
  return res.status(200).json({ 
    message: "Logged out successfully"
  });
});

// Get current user
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    const user = await storage.getUser(req.userId);
    
    if (!user) {
      return res.status(404).json({ 
        error: "User not found"
      });
    }
    
    // Remove sensitive information before sending response
    const { password, ...userWithoutPassword } = user;
    
    return res.status(200).json({ 
      user: userWithoutPassword
    });
  } catch (error) {
    console.error("Get current user error:", error);
    return res.status(500).json({ 
      error: "Server error"
    });
  }
});

// Verify email
router.post(
  "/verify-email", 
  validateBody(verifyEmailSchema), 
  async (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      const verified = await verifyEmail(token);
      
      if (verified) {
        return res.status(200).json({ 
          message: "Email verified successfully"
        });
      } else {
        return res.status(400).json({ 
          error: "Email verification failed"
        });
      }
    } catch (error) {
      console.error("Email verification error:", error);
      return res.status(400).json({ 
        error: (error as Error).message || "Email verification failed"
      });
    }
  }
);

// Request password reset
router.post(
  "/forgot-password", 
  validateBody(resetPasswordRequestSchema), 
  async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      await requestPasswordReset(email);
      
      // Always return success to prevent email enumeration
      return res.status(200).json({ 
        message: "If your email is registered, you will receive password reset instructions"
      });
    } catch (error) {
      console.error("Password reset request error:", error);
      // Always return success to prevent email enumeration
      return res.status(200).json({ 
        message: "If your email is registered, you will receive password reset instructions"
      });
    }
  }
);

// Reset password
router.post(
  "/reset-password", 
  validateBody(resetPasswordSchema), 
  async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;
      const reset = await resetPassword(token, password);
      
      if (reset) {
        return res.status(200).json({ 
          message: "Password reset successfully"
        });
      } else {
        return res.status(400).json({ 
          error: "Password reset failed"
        });
      }
    } catch (error) {
      console.error("Password reset error:", error);
      return res.status(400).json({ 
        error: (error as Error).message || "Password reset failed"
      });
    }
  }
);

export default router;