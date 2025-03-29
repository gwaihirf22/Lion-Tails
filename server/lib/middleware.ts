import { Request, Response, NextFunction } from "express";
import { verifyToken } from "./auth";
import { storage } from "../storage";
import session from "express-session";

// Extend Express Request type to include user ID and other properties
declare global {
  namespace Express {
    interface Request {
      userId?: number;
      isVerified?: boolean;
      isAdmin?: boolean;
    }
  }
}

// Extend express-session with custom token property
declare module 'express-session' {
  interface SessionData {
    token?: string;
  }
}

/**
 * Middleware to authenticate users
 * This middleware verifies the JWT token and attaches user data to the request
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    // Get token from Authorization header or cookie
    let token: string | undefined;
    
    // Check Authorization header with Bearer token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
    
    // If no token in header, check cookies
    if (!token && req.cookies && req.cookies.authToken) {
      token = req.cookies.authToken;
    }
    
    // If still no token, check session (for more robust auth)
    if (!token && req.session.token) {
      token = req.session.token;
    }
    
    // If no token found, continue as unauthenticated
    if (!token) {
      return next();
    }
    
    // Verify token
    const decoded = verifyToken(token);
    if (!decoded) {
      return next();
    }
    
    // Attach user data to request
    req.userId = decoded.id;
    req.isVerified = decoded.isVerified;
    req.isAdmin = decoded.isAdmin;
    
    next();
  } catch (error) {
    // Continue as unauthenticated in case of any error
    next();
  }
}

/**
 * Middleware to require authentication
 * This middleware should be used after the authenticate middleware
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

/**
 * Middleware to require verified email
 * This middleware must be used after the authenticate middleware
 */
export function requireVerified(req: Request, res: Response, next: NextFunction) {
  if (!req.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  if (!req.isVerified) {
    return res.status(403).json({ error: "Email verification required" });
  }
  
  next();
}

/**
 * Middleware to require admin privileges
 * This middleware must be used after the authenticate middleware
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  if (!req.isAdmin) {
    return res.status(403).json({ error: "Admin privileges required" });
  }
  
  next();
}

/**
 * Middleware to validate request body using Zod schema
 */
export function validateBody(schema: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validData = schema.parse(req.body);
      req.body = validData;
      next();
    } catch (error: any) {
      return res.status(400).json({ 
        error: "Validation error", 
        details: error.errors || error.message 
      });
    }
  };
}

/**
 * Middleware to validate request parameters using Zod schema
 */
export function validateParams(schema: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validData = schema.parse(req.params);
      req.params = validData;
      next();
    } catch (error: any) {
      return res.status(400).json({ 
        error: "Validation error", 
        details: error.errors || error.message 
      });
    }
  };
}

/**
 * Middleware to validate request query using Zod schema
 */
export function validateQuery(schema: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validData = schema.parse(req.query);
      req.query = validData;
      next();
    } catch (error: any) {
      return res.status(400).json({ 
        error: "Validation error", 
        details: error.errors || error.message 
      });
    }
  };
}