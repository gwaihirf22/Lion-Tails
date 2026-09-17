import { PARENT_MODE_WINDOW_MS, parentModeActive, type ParentModeSession } from "@shared/parentMode";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { insertUserSchema, publicUser, User as SelectUser } from "@shared/schema";
import { ACCOUNT_SUSPENDED_CODE, ACCOUNT_SUSPENDED_MESSAGE, isBanned } from "@shared/accountStatus";
import { requiredSecret } from "./config";
import { denyBannedAccounts } from "./lib/requireAuth";

// Registration is unauthenticated, so its body is attacker-controlled.
//
// insertUserSchema still carries isAdmin, isVerified and verificationToken --
// those are legitimate for an internal caller to set, and it is the shared
// insert type. What made them dangerous is that the handler used to spread
// ...req.body straight into storage.createUser(), and drizzle's .values()
// copies whichever keys the object happens to have rather than the table's
// columns (node_modules/drizzle-orm/pg-core/query-builders/insert.js -- it
// iterates Object.keys(entry)). So a request could name any column.
//
// Omitting the three privilege fields here is the fix. Zod strips unknown keys
// by default, so anything else a client invents is dropped too. createUser has
// exactly one caller -- this handler -- so nothing legitimate loses a field.
export const registerBodySchema = insertUserSchema.omit({
  isAdmin: true,
  isVerified: true,
  verificationToken: true,
});

declare global {
  namespace Express {
    interface User extends SelectUser {}
    interface Session {
      parentModeExpiry?: number;
      /** Chosen at the password prompt: on until turned off or signed out. */
      parentModeIndefinite?: boolean;
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
  app.use(denyBannedAccounts);

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        }
        /**
         * THE PASSWORD IS CHECKED FIRST, on purpose.
         *
         * Refusing a banned account before checking its password would turn
         * this form into an oracle: type any username, and a different answer
         * for "suspended" than for "wrong password" tells a stranger which
         * accounts exist. Only somebody who already knows the password learns
         * that the account is suspended.
         */
        if (isBanned(user)) {
          return done(null, false, { message: ACCOUNT_SUSPENDED_CODE });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  /**
   * NO USER MEANS SIGNED OUT, NOT BROKEN.
   *
   * `done(null, undefined)` is not "there is no such user" to passport: an
   * undefined result means "this deserializer passes, try the next one", and
   * with one registered it falls off the end of the stack into
   * `new Error("Failed to deserialize user out of session")`
   * (passport/lib/authenticator.js). That reaches the error handler as a 500 --
   * so a session whose row has gone answers 500 to EVERY request, for a week,
   * until the cookie lapses. There is no way out of it from inside the app.
   *
   * `false` is the value that means it: passport clears
   * `req.session.passport.user` (lib/strategies/session.js) and the request
   * carries on as anonymous. Which is also the mechanism a ban needs -- refuse
   * here and a live session ends on its owner's next click, with no hunt
   * through the session table, which has no user id to hunt by.
   *
   * getUser returns undefined for a deleted row AND for a database outage, so
   * this signs people out rather than 500ing in both cases. Signed out and
   * able to sign in again is the better failure.
   */
  /**
   * Three arguments, not two, so a refusal can leave a note.
   *
   * Passport hands the request to a deserializer of arity 3, which is the only
   * way to tell the difference downstream between "signed out" and "locked
   * out" -- both leave req.user undefined. The note is what lets the next
   * middleware answer 403 with a sentence instead of a silent 401.
   */
  const deserialize = async (
    req: Express.Request,
    id: number,
    done: (err: unknown, user?: SelectUser | false) => void,
  ) => {
    try {
      const user = await storage.getUser(id);
      if (user && isBanned(user)) {
        (req as { accountSuspended?: boolean }).accountSuspended = true;
        // false, not the user: passport then clears session.passport.user
        // itself, so the ban takes hold on this request AND the session stops
        // carrying a login. No hunt through the session table, which has no
        // user id to hunt by.
        return done(null, false);
      }
      done(null, user ?? false);
    } catch (err) {
      done(err);
    }
  };
  /**
   * Registered through a cast because @types/passport declares only the
   * two-argument form. The three-argument one is real: authenticator.js reads
   * the function's arity and passes the request when it is 3.
   */
  passport.deserializeUser(deserialize as unknown as (id: unknown, done: (err: unknown, user?: unknown) => void) => void);

  // Authentication endpoints
  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const parsed = registerBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid registration details",
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const credentials = parsed.data;

      const existingUser = await storage.getUserByUsername(credentials.username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const existingEmail = await storage.getUserByEmail(credentials.email);
      if (existingEmail) {
        return res.status(400).json({ error: "Email already in use" });
      }

      // Spread the PARSED body, never req.body -- that is the whole point.
      const user = await storage.createUser({
        ...credentials,
        password: await hashPassword(credentials.password),
      });

      /**
       * WHERE THIS ONE CAME FROM. The only address this app keeps, and it is
       * kept so that six accounts appearing from one place in one hour is a
       * question somebody can ask. Best-effort: a sign-up must not fail
       * because a column could not be written.
       */
      void storage.recordSignup(user.id, req.ip).catch(() => undefined);

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(publicUser(user));
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: Error | null, user: SelectUser | false, info: any) => {
      if (err) return next(err);
      if (!user && info?.message === ACCOUNT_SUSPENDED_CODE) {
        return res.status(403).json({ error: ACCOUNT_SUSPENDED_MESSAGE, code: ACCOUNT_SUSPENDED_CODE });
      }
      if (!user) return res.status(401).json({ error: "Invalid username or password" });
      
      req.login(user, (err) => {
        if (err) return next(err);
        // Stamped here, once per sign-in, and NOT in deserializeUser -- that
        // runs on every request, so stamping there would turn reading a story
        // into a write. "Last activity" is a different question and the
        // accounts page answers it from story_jobs.
        void storage.recordLogin(user.id).catch(() => undefined);
        res.status(200).json(publicUser(user));
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
    // PICKED, not stripped: this used to remove the password and publish
    // everything else, which included the password RESET TOKEN -- a
    // credential -- and would publish every column added later.
    res.json(publicUser(req.user as SelectUser));
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
        // Two ways on, chosen at the prompt each time: the window, or until
        // turned off / signed out. Both are session fields, so logging out
        // ends either, and the login cookie's own lifetime bounds "indefinite"
        // whatever the row says. Never a setting -- a forgotten setting on a
        // shared device is Parent Mode for the children.
        const keep = req.body?.keep === true;
        const session = req.session as ParentModeSession;
        session.parentModeIndefinite = keep;
        session.parentModeExpiry = keep ? null : Date.now() + PARENT_MODE_WINDOW_MS;
        res.json({
          success: true,
          expiresAt: session.parentModeExpiry,
          indefinite: keep,
        });
      } else {
        res.status(401).json({ error: "Invalid password" });
      }
    } catch (error) {
      console.error("Password verification error:", error);
      next(error);
    }
  });

  // Check Parent Mode status -- the same predicate the guards use.
  app.get("/api/auth/parent-mode-status", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const session = req.session as ParentModeSession | undefined;
    res.json({
      isActive: parentModeActive(session),
      expiresAt: session?.parentModeExpiry ?? null,
      indefinite: Boolean(session?.parentModeIndefinite),
    });
  });

  /**
   * Turn Parent Mode OFF, on the server.
   *
   * There was no such route: the client's "disable" cleared React state and
   * sent nothing, so the session stayed valid and the next status poll or
   * window focus turned it back on. With a 30-minute window that was a
   * nuisance; with "until I turn it off" it would have made the off switch a
   * lie.
   */
  app.post("/api/auth/parent-mode-off", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const session = req.session as ParentModeSession;
    session.parentModeIndefinite = false;
    session.parentModeExpiry = null;
    res.json({ isActive: false, expiresAt: null, indefinite: false });
  });
}