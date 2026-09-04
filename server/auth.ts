import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { requiredSecret } from "./config";

declare global {
  namespace Express {
    interface User extends SelectUser {}
    interface Session {
      parentModeExpiry?: number;
    }
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: requiredSecret("SESSION_SECRET", "lion-tails-dev-session-secret"),
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      sameSite: "lax"
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      } catch (err) {
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  // Authentication endpoints
  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const existingEmail = await storage.getUserByEmail(req.body.email);
      if (existingEmail) {
        return res.status(400).json({ error: "Email already in use" });
      }

      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
      });

      req.login(user, (err) => {
        if (err) return next(err);
        // Don't send password in response
        const { password, ...userWithoutPassword } = user;
        res.status(201).json(userWithoutPassword);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: Error | null, user: SelectUser | false, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: "Invalid username or password" });
      
      req.login(user, (err) => {
        if (err) return next(err);
        // Don't send password in response
        const { password, ...userWithoutPassword } = user;
        res.status(200).json(userWithoutPassword);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.status(200).json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    // Don't send password in response
    const { password, ...userWithoutPassword } = req.user as SelectUser;
    res.json(userWithoutPassword);
  });

  // Email verification endpoint
  app.post("/api/auth/verify-email", async (req, res, next) => {
    try {
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ error: "Verification token is required" });
      }

      const tokenData = await storage.getVerificationToken(token);
      if (!tokenData) {
        return res.status(400).json({ error: "Invalid or expired token" });
      }

      if (tokenData.type !== 'email') {
        return res.status(400).json({ error: "Invalid token type" });
      }

      const success = await storage.verifyUser(tokenData.userId);
      if (!success) {
        return res.status(500).json({ error: "Failed to verify user" });
      }

      // Delete the used token
      await storage.deleteVerificationToken(token);

      res.status(200).json({ message: "Email verified successfully" });
    } catch (error) {
      next(error);
    }
  });

  // Password reset request endpoint
  app.post("/api/auth/reset-password-request", async (req, res, next) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        // For security reasons, don't reveal if email exists
        return res.status(200).json({ message: "If your email is registered, you will receive a password reset link" });
      }

      // Generate a password reset token
      const token = await storage.createVerificationToken(user.id, 'password');

      // TODO: Send password reset email
      // This would typically involve sending an email with a link containing the token
      // For now, we'll just return the token in the response for testing purposes
      // In a real app, you would never return the token in the response

      res.status(200).json({ 
        message: "If your email is registered, you will receive a password reset link",
        token: process.env.NODE_ENV === 'development' ? token : undefined, // Only return token in development
      });
    } catch (error) {
      next(error);
    }
  });

  // Password reset endpoint
  app.post("/api/auth/reset-password", async (req, res, next) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ error: "Token and password are required" });
      }

      const tokenData = await storage.getVerificationToken(token);
      if (!tokenData) {
        return res.status(400).json({ error: "Invalid or expired token" });
      }

      if (tokenData.type !== 'password') {
        return res.status(400).json({ error: "Invalid token type" });
      }

      // Update the user's password
      const user = await storage.getUser(tokenData.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      await storage.updateUser(user.id, {
        password: await hashPassword(password),
      });

      // Delete the used token
      await storage.deleteVerificationToken(token);

      res.status(200).json({ message: "Password reset successfully" });
    } catch (error) {
      next(error);
    }
  });

  // Password verification endpoint for Parent Mode
  app.post("/api/auth/verify-password", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ error: "Password is required" });
      }

      const user = await storage.getUserByUsername((req.user as any).username);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const isValid = await comparePasswords(password, user.password);
      
      if (isValid) {
        // Set session flag with 30-minute expiration
        if (req.session) {
          (req.session as any).parentModeExpiry = Date.now() + (30 * 60 * 1000); // 30 minutes
        }
        res.json({ 
          success: true, 
          expiresAt: (req.session as any)?.parentModeExpiry 
        });
      } else {
        res.status(401).json({ error: "Invalid password" });
      }
    } catch (error) {
      console.error("Password verification error:", error);
      next(error);
    }
  });

  // Check Parent Mode status
  app.get("/api/auth/parent-mode-status", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    const isActive = (req.session as any)?.parentModeExpiry && Date.now() < (req.session as any).parentModeExpiry;
    res.json({ 
      isActive: !!isActive, 
      expiresAt: (req.session as any)?.parentModeExpiry || null 
    });
  });
}