import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { storage } from "../storage";
import { InsertUser, User, LoginUser, RegisterUser } from "@shared/schema";
import nodemailer from "nodemailer";
import { requiredSecret } from "../config";

// JWT secret from environment or a fallback for development
const JWT_SECRET = requiredSecret("JWT_SECRET", "lion-tails-dev-jwt-secret");
const JWT_EXPIRY = "7d"; // JWT expiry time

// Email configuration (only for production)
const EMAIL_FROM = process.env.EMAIL_FROM || "noreply@liontails.com";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

/**
 * Hash a password with bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

/**
 * Compare a password with a hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

/**
 * Generate a JWT token for a user
 */
export function generateToken(user: User): string {
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    isVerified: user.isVerified,
    isAdmin: user.isAdmin,
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/**
 * Verify a JWT token
 */
export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * Register a new user
 */
export async function registerUser(userData: RegisterUser): Promise<{ user: User; token: string }> {
  // Check if user already exists
  const existingEmail = await storage.getUserByEmail(userData.email);
  if (existingEmail) {
    throw new Error("Email is already registered");
  }
  
  const existingUsername = await storage.getUserByUsername(userData.username);
  if (existingUsername) {
    throw new Error("Username is already taken");
  }
  
  // Hash password and create user
  const hashedPassword = await hashPassword(userData.password);
  
  // Generate verification token
  const verificationToken = crypto.randomBytes(32).toString("hex");
  
  // Create user
  const newUser: InsertUser = {
    username: userData.username,
    email: userData.email,
    password: hashedPassword,
    firstName: userData.firstName,
    lastName: userData.lastName,
    isVerified: false,
    isAdmin: false,
    verificationToken: verificationToken,
  };
  
  const user = await storage.createUser(newUser);
  
  // Create a verification token in the database
  await storage.createVerificationToken(user.id, "email");
  
  // Send verification email
  await sendVerificationEmail(user, verificationToken);
  
  // Generate JWT token
  const token = generateToken(user);
  
  return { user, token };
}

/**
 * Login a user
 */
export async function loginUser(credentials: LoginUser): Promise<{ user: User; token: string }> {
  // Find user by email or username
  let user: User | undefined;
  
  if (credentials.email) {
    user = await storage.getUserByEmail(credentials.email);
  } else if (credentials.username) {
    user = await storage.getUserByUsername(credentials.username);
  }
  
  if (!user) {
    throw new Error("Invalid credentials");
  }
  
  // Verify password
  const isPasswordValid = await comparePassword(credentials.password, user.password);
  if (!isPasswordValid) {
    throw new Error("Invalid credentials");
  }
  
  // Generate JWT token
  const token = generateToken(user);
  
  return { user, token };
}

/**
 * Verify a user's email using a token
 */
export async function verifyEmail(token: string): Promise<boolean> {
  const verificationData = await storage.getVerificationToken(token);
  
  if (!verificationData) {
    throw new Error("Invalid or expired verification token");
  }
  
  // Check if token type is 'email'
  if (verificationData.type !== "email") {
    throw new Error("Invalid token type");
  }
  
  // Check if token is expired
  if (new Date() > verificationData.expiresAt) {
    throw new Error("Verification token has expired");
  }
  
  // Verify the user
  const verified = await storage.verifyUser(verificationData.userId);
  
  // Delete the token after use
  await storage.deleteVerificationToken(token);
  
  return verified;
}

/**
 * Send a verification email to a user
 */
export async function sendVerificationEmail(user: User, token: string): Promise<boolean> {
  if (process.env.NODE_ENV === "production") {
    try {
      // Setup email transport
      const transporter = nodemailer.createTransport({
        // Configure your email provider here
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || "587"),
        secure: process.env.EMAIL_SECURE === "true",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
      });
      
      // Send the email
      await transporter.sendMail({
        from: EMAIL_FROM,
        to: user.email,
        subject: "Verify your Lion Tails account",
        text: `Hello ${user.firstName || user.username},\n\nPlease verify your email by clicking the following link: ${FRONTEND_URL}/verify-email?token=${token}\n\nThis link will expire in 24 hours.\n\nThank you,\nThe Lion Tails Team`,
        html: `
          <h1>Email Verification</h1>
          <p>Hello ${user.firstName || user.username},</p>
          <p>Please verify your email by clicking the following link:</p>
          <p><a href="${FRONTEND_URL}/verify-email?token=${token}">Verify Email</a></p>
          <p>This link will expire in 24 hours.</p>
          <p>Thank you,<br>The Lion Tails Team</p>
        `,
      });
      
      return true;
    } catch (error) {
      console.error("Failed to send verification email:", error);
      return false;
    }
  }
  
  // In development, log the verification URL
  console.log(`Verification URL: ${FRONTEND_URL}/verify-email?token=${token}`);
  return true;
}

/**
 * Request a password reset email
 */
export async function requestPasswordReset(email: string): Promise<boolean> {
  const user = await storage.getUserByEmail(email);
  
  if (!user) {
    // Don't reveal that the email doesn't exist
    return true;
  }
  
  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString("hex");
  
  // Create a token in the database
  await storage.createVerificationToken(user.id, "password");
  
  // Update user with reset token
  const resetExpires = new Date();
  resetExpires.setHours(resetExpires.getHours() + 24); // 24 hours from now
  
  await storage.updateUser(user.id, {
    resetPasswordToken: resetToken,
    resetPasswordExpires: resetExpires,
  });
  
  if (process.env.NODE_ENV === "production") {
    try {
      // Setup email transport
      const transporter = nodemailer.createTransport({
        // Configure your email provider here
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || "587"),
        secure: process.env.EMAIL_SECURE === "true",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
      });
      
      // Send the email
      await transporter.sendMail({
        from: EMAIL_FROM,
        to: user.email,
        subject: "Reset your Lion Tails password",
        text: `Hello ${user.firstName || user.username},\n\nYou requested a password reset. Please click the following link to reset your password: ${FRONTEND_URL}/reset-password?token=${resetToken}\n\nThis link will expire in 24 hours.\n\nIf you did not request this, please ignore this email.\n\nThank you,\nThe Lion Tails Team`,
        html: `
          <h1>Password Reset</h1>
          <p>Hello ${user.firstName || user.username},</p>
          <p>You requested a password reset. Please click the following link to reset your password:</p>
          <p><a href="${FRONTEND_URL}/reset-password?token=${resetToken}">Reset Password</a></p>
          <p>This link will expire in 24 hours.</p>
          <p>If you did not request this, please ignore this email.</p>
          <p>Thank you,<br>The Lion Tails Team</p>
        `,
      });
      
      return true;
    } catch (error) {
      console.error("Failed to send password reset email:", error);
      return false;
    }
  }
  
  // In development, log the reset URL
  console.log(`Password Reset URL: ${FRONTEND_URL}/reset-password?token=${resetToken}`);
  return true;
}

/**
 * Reset a user's password using a token
 */
export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  // Find user with this token
  const user = await storage.getUserByEmail(token);
  
  if (!user) {
    throw new Error("Invalid or expired reset token");
  }
  
  // Verify token is not expired
  if (!user.resetPasswordExpires || new Date() > user.resetPasswordExpires) {
    throw new Error("Reset token has expired");
  }
  
  // Hash new password and update user
  const hashedPassword = await hashPassword(newPassword);
  
  await storage.updateUser(user.id, {
    password: hashedPassword,
    resetPasswordToken: null,
    resetPasswordExpires: null,
  });
  
  return true;
}