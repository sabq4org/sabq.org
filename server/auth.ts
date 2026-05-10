import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import AppleStrategy from "passport-apple";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { db, pool } from "./db";
import { users, canUserLogin, getUserStatusMessage } from "@shared/schema";
import { eq, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import appleSignin from "apple-signin-auth";
import { memoryCache, CACHE_TTL } from "./memoryCache";
import { getRedisClient } from "./redis";
import { RedisStore } from "connect-redis";
import type { RedisSessionClient } from "./redis";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET environment variable is required. Set it before starting the server.");
  }

  let store: session.Store;
  const redis = getRedisClient();
  if (redis) {
    store = new RedisStore({
      client: redis,
      prefix: "sess:",
      ttl: Math.floor(sessionTtl / 1000),
    });
    console.log("[Session] Using Redis store (fast, no DB pressure)");
  } else {
    const pgStore = connectPg(session);
    store = new pgStore({
      pool: pool,
      createTableIfMissing: false,
      ttl: sessionTtl,
      tableName: "sessions",
    });
    console.log("[Session] Using PostgreSQL store (add REDIS_URL for better performance)");
  }

  // Cross-subdomain cookie config (when frontend on Vercel and backend on
  // Railway share a parent domain, e.g. sabq.news + api.sabq.news):
  //   COOKIE_DOMAIN=.sabq.news  → sets the cookie on the parent domain
  //   COOKIE_SAMESITE=none      → required for cross-site fetch credentials
  // For same-origin local dev, leave both unset (defaults below).
  // SameSite=None requires Secure=true; we enforce that combo explicitly.
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
  const cookieSameSite = (process.env.COOKIE_SAMESITE as "lax" | "strict" | "none" | undefined) || "lax";
  const cookieSecure = cookieSameSite === "none" ? true : process.env.NODE_ENV === "production";

  return session({
    secret: sessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: cookieSameSite,
      maxAge: sessionTtl,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    },
  });
}

const SESSION_REQUIRED_PREFIXES = [
  '/api/auth/',
  '/api/login',
  '/api/register',
  '/api/logout',
  '/api/admin/',
  '/api/dashboard/',
  '/api/user/',
  '/api/bookmarks',
  '/api/reactions',
  '/api/personal-feed',
  '/api/comments',
  '/api/profile',
  '/api/notifications',
  '/api/follow',
  '/api/unfollow',
  '/api/my-',
  '/api/ifox/',
  '/ifox/',
  '/api/wallet',
  '/api/settings',
  '/api/onboarding',
  '/api/membership',
  '/api/subscription',
  '/api/credits',
  '/api/tasks',
  '/api/ai-tasks',
  '/api/email-agent',
  '/api/media-store/purchases',
  '/api/csrf-token',
];

function needsSession(req: { method: string; path: string; headers: Record<string, any> }): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    return true;
  }
  const hasCookie = !!(req.headers.cookie && req.headers.cookie.includes('connect.sid'));
  if (hasCookie) return true;
  for (const prefix of SESSION_REQUIRED_PREFIXES) {
    if (req.path.startsWith(prefix)) return true;
  }
  return false;
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  const sessionMiddleware = getSession();
  const passportInit = passport.initialize();
  const passportSession = passport.session();

  app.use((req, res, next) => {
    if (!needsSession(req)) {
      return next();
    }
    sessionMiddleware(req, res, (err?: any) => {
      if (err) return next(err);
      passportInit(req, res, (err2?: any) => {
        if (err2) return next(err2);
        passportSession(req, res, next);
      });
    });
  });

  passport.use(
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
      },
      async (email, password, done) => {
        try {
          console.log("🔍 LocalStrategy: Checking user:", email);
          
          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, email.toLowerCase()))
            .limit(1);

          if (!user) {
            console.log("❌ LocalStrategy: User not found");
            return done(null, false, { message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
          }

          console.log("✅ LocalStrategy: User found, checking password");

          if (!user.passwordHash) {
            console.log("❌ LocalStrategy: No password hash");
            return done(null, false, { message: "هذا الحساب يحتاج إلى إعادة تعيين كلمة المرور" });
          }

          const isValidPassword = await bcrypt.compare(password, user.passwordHash);
          console.log("🔑 LocalStrategy: Password valid?", isValidPassword);
          
          if (!isValidPassword) {
            return done(null, false, { message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
          }

          // Check if user can login (not banned or deleted)
          if (!canUserLogin(user)) {
            const statusMessage = getUserStatusMessage(user);
            console.log("❌ LocalStrategy: User cannot login:", statusMessage);
            return done(null, false, { 
              message: statusMessage || "لا يمكنك تسجيل الدخول بسبب حالة حسابك. يرجى التواصل مع الإدارة" 
            });
          }

          console.log("✅ LocalStrategy: Success!");
          return done(null, { 
            id: user.id, 
            email: user.email,
            twoFactorEnabled: user.twoFactorEnabled,
            twoFactorMethod: user.twoFactorMethod
          });
        } catch (error) {
          console.error("❌ LocalStrategy error:", error);
          return done(error);
        }
      }
    )
  );

  // Google OAuth Strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: `${process.env.FRONTEND_URL || 'http://localhost:5000'}/api/auth/google/callback`,
          scope: ['profile', 'email'],
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            console.log("🔍 GoogleStrategy: Processing user:", profile.emails?.[0]?.value);
            
            const email = profile.emails?.[0]?.value;
            const googleId = profile.id;

            if (!email) {
              return done(null, false, { message: "لم نتمكن من الحصول على البريد الإلكتروني من Google" });
            }

            // Check if user exists with this Google ID or email
            const [existingUser] = await db
              .select()
              .from(users)
              .where(or(
                eq(users.googleId, googleId),
                eq(users.email, email.toLowerCase())
              ))
              .limit(1);

            if (existingUser) {
              // Update Google ID if not set
              if (!existingUser.googleId) {
                await db
                  .update(users)
                  .set({ googleId, authProvider: 'google' })
                  .where(eq(users.id, existingUser.id));
              }

              // Check if user can login
              if (!canUserLogin(existingUser)) {
                const statusMessage = getUserStatusMessage(existingUser);
                console.log("❌ GoogleStrategy: User cannot login:", statusMessage);
                return done(null, false, { 
                  message: statusMessage || "لا يمكنك تسجيل الدخول بسبب حالة حسابك. يرجى التواصل مع الإدارة" 
                });
              }

              console.log("✅ GoogleStrategy: Existing user logged in");
              return done(null, {
                id: existingUser.id,
                email: existingUser.email,
                isProfileComplete: existingUser.isProfileComplete ?? true, // ✅ Pass profile status
                twoFactorEnabled: false, // OAuth users don't need 2FA
                twoFactorMethod: 'authenticator'
              });
            }

            // Create new user
            const newUserId = nanoid();
            const firstName = profile.name?.givenName || profile.displayName?.split(' ')[0] || '';
            const lastName = profile.name?.familyName || profile.displayName?.split(' ').slice(1).join(' ') || '';
            const profileImage = profile.photos?.[0]?.value;

            await db.insert(users).values({
              id: newUserId,
              email: email.toLowerCase(),
              firstName,
              lastName,
              profileImageUrl: profileImage,
              role: 'reader',
              authProvider: 'google',
              googleId,
              emailVerified: true, // Google already verified the email
              status: 'active',
              isProfileComplete: false, // ✅ New users need onboarding
              allowedLanguages: ['ar']
            });

            console.log("✅ GoogleStrategy: New user created");
            return done(null, {
              id: newUserId,
              email: email.toLowerCase(),
              isProfileComplete: false, // ✅ New users need to complete onboarding
              twoFactorEnabled: false,
              twoFactorMethod: 'authenticator'
            });

          } catch (error) {
            console.error("❌ GoogleStrategy error:", error);
            return done(error);
          }
        }
      )
    );
    console.log("✅ Google OAuth Strategy initialized");
  } else {
    console.log("⚠️  Google OAuth not configured (GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing)");
  }

  // Apple OAuth Strategy
  if (process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY) {
    // Format the private key properly
    let privateKey = process.env.APPLE_PRIVATE_KEY;
    
    // If the key is stored as a single line (common in env variables), convert it to multiline format
    if (!privateKey.includes('\n')) {
      // Replace literal \n with actual newlines
      privateKey = privateKey.replace(/\\n/g, '\n');
    }
    
    // Ensure proper PEM format with headers
    if (!privateKey.includes('BEGIN PRIVATE KEY')) {
      console.error("❌ Apple private key must include PEM headers (BEGIN PRIVATE KEY)");
    }
    
    // Trim any whitespace
    privateKey = privateKey.trim();
    
    console.log("🔑 Apple private key formatted (length:", privateKey.length, ")");
    
    passport.use(
      new AppleStrategy(
        {
          clientID: process.env.APPLE_CLIENT_ID,
          teamID: process.env.APPLE_TEAM_ID,
          callbackURL: `${process.env.FRONTEND_URL || 'http://localhost:5000'}/api/auth/apple/callback`,
          keyID: process.env.APPLE_KEY_ID,
          privateKeyString: privateKey,
          passReqToCallback: true,
        },
        async (req: any, accessToken: string, refreshToken: string, idToken: string, profile: any, done: any) => {
          try {
            console.log("🔍 AppleStrategy: Processing user");
            
            // Verify and decode the idToken securely
            const verifiedToken = await appleSignin.verifyIdToken(idToken, {
              audience: process.env.APPLE_CLIENT_ID!,
              ignoreExpiration: false,
            });
            
            const appleId = verifiedToken.sub;
            const email = verifiedToken.email;

            if (!appleId || !email) {
              return done(null, false, { message: "لم نتمكن من الحصول على البريد الإلكتروني من Apple" });
            }

            // Get name from req.body.user (only available on first login)
            let firstName = '';
            let lastName = '';
            if (req.body.user) {
              try {
                const userData = typeof req.body.user === 'string' ? JSON.parse(req.body.user) : req.body.user;
                firstName = userData.name?.firstName || '';
                lastName = userData.name?.lastName || '';
                console.log("✅ AppleStrategy: Got name from first login:", firstName, lastName);
              } catch (e) {
                console.log("⚠️  AppleStrategy: Could not parse user data");
              }
            }

            // Check if user exists with this Apple ID or email
            const [existingUser] = await db
              .select()
              .from(users)
              .where(or(
                eq(users.appleId, appleId),
                eq(users.email, email.toLowerCase())
              ))
              .limit(1);

            if (existingUser) {
              // Update Apple ID if not set
              if (!existingUser.appleId) {
                await db
                  .update(users)
                  .set({ appleId, authProvider: 'apple' })
                  .where(eq(users.id, existingUser.id));
              }

              // Update name if we got it and user doesn't have it
              if (firstName && lastName && !existingUser.firstName) {
                await db
                  .update(users)
                  .set({ firstName, lastName })
                  .where(eq(users.id, existingUser.id));
              }

              // Check if user can login
              if (!canUserLogin(existingUser)) {
                const statusMessage = getUserStatusMessage(existingUser);
                console.log("❌ AppleStrategy: User cannot login:", statusMessage);
                return done(null, false, { 
                  message: statusMessage || "لا يمكنك تسجيل الدخول بسبب حالة حسابك. يرجى التواصل مع الإدارة" 
                });
              }

              console.log("✅ AppleStrategy: Existing user logged in");
              return done(null, {
                id: existingUser.id,
                email: existingUser.email,
                isProfileComplete: existingUser.isProfileComplete ?? true, // ✅ Pass profile status
                twoFactorEnabled: false, // OAuth users don't need 2FA
                twoFactorMethod: 'authenticator'
              });
            }

            // Create new user
            const newUserId = nanoid();

            await db.insert(users).values({
              id: newUserId,
              email: email.toLowerCase(),
              firstName,
              lastName,
              role: 'reader',
              authProvider: 'apple',
              appleId,
              emailVerified: true, // Apple already verified the email
              status: 'active',
              isProfileComplete: false, // ✅ New users need onboarding
              allowedLanguages: ['ar']
            });

            console.log("✅ AppleStrategy: New user created");
            return done(null, {
              id: newUserId,
              email: email.toLowerCase(),
              isProfileComplete: false, // ✅ New users need to complete onboarding
              twoFactorEnabled: false,
              twoFactorMethod: 'authenticator'
            });

          } catch (error) {
            console.error("❌ AppleStrategy error:", error);
            return done(error);
          }
        }
      )
    );
    console.log("✅ Apple OAuth Strategy initialized");
  } else {
    console.log("⚠️  Apple OAuth not configured (APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, or APPLE_PRIVATE_KEY missing)");
  }

  passport.serializeUser((user: any, done) => {
    console.log('🔹 SerializeUser:', user.id);
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const cacheKey = `user:session:${id}`;
      
      // Check cache first
      const cachedUser = memoryCache.get(cacheKey);
      if (cachedUser) {
        return done(null, cachedUser);
      }
      
      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }
      
      const serializedUser = { 
        id: user.id, 
        email: user.email,
        role: user.role,
        allowedLanguages: user.allowedLanguages || [],
        hasPressCard: user.hasPressCard || false,
      };
      
      // Cache for 5 minutes
      memoryCache.set(cacheKey, serializedUser, CACHE_TTL.MEDIUM);
      
      done(null, serializedUser);
    } catch (error) {
      console.error('❌ DeserializeUser error:', error);
      done(error);
    }
  });
}

// Invalidate session cache when user data changes
export function invalidateUserSessionCache(userId: string): void {
  memoryCache.delete(`user:session:${userId}`);
}

// Bounded activity update cache to prevent memory leaks
const MAX_ACTIVITY_CACHE_ENTRIES = 5000;
const activityUpdateCache = new Map<string, number>();
const ACTIVITY_UPDATE_INTERVAL = 60000; // Only update once per minute per user

function addToActivityCache(userId: string, timestamp: number): void {
  activityUpdateCache.set(userId, timestamp);
  
  // Auto-evict oldest entry if we exceed max size
  if (activityUpdateCache.size > MAX_ACTIVITY_CACHE_ENTRIES) {
    const firstKey = activityUpdateCache.keys().next().value;
    if (firstKey) {
      activityUpdateCache.delete(firstKey);
    }
  }
}

// Periodic cleanup: remove stale entries older than 1 hour every 30 minutes
const ACTIVITY_CACHE_MAX_AGE = 60 * 60 * 1000; // 1 hour
const activityCleanupTimer = setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, timestamp] of Array.from(activityUpdateCache.entries())) {
    if (now - timestamp > ACTIVITY_CACHE_MAX_AGE) {
      activityUpdateCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[Activity Cache] Cleaned ${cleaned} stale entries (remaining: ${activityUpdateCache.size})`);
  }
}, 30 * 60 * 1000);
activityCleanupTimer.unref();

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (req.isAuthenticated?.()) {
    // Update user activity asynchronously (debounced to avoid database spam)
    const userId = (req.user as any)?.id;
    if (userId) {
      const now = Date.now();
      const lastUpdate = activityUpdateCache.get(userId) || 0;
      
      if (now - lastUpdate > ACTIVITY_UPDATE_INTERVAL) {
        addToActivityCache(userId, now);
        // Fire and forget - don't block the request
        storage.updateUserActivity(userId).catch(err => {
          console.error('[Activity] Error updating user activity:', err);
        });
      }
    }
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
};
