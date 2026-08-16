import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import AppleStrategy from "passport-apple";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { db, getSessionFallbackPool } from "./db";
import { users, appMemberSessions, canUserLogin, getUserStatusMessage } from "@shared/schema";
import { eq, or, sql, and, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import appleSignin from "apple-signin-auth";
import { memoryCache, CACHE_TTL } from "./memoryCache";
import { getRedisSessionAdapter } from "./redis";
import { RedisStore } from "connect-redis";
import {
  SESSION_DEGRADED_HEADER,
  SessionFailoverStore,
  sessionIdFromCookieHeader,
} from "./sessionFailoverStore";

/**
 * مرجع لمخزن الجلسات الثنائي حين يكون Redis مفعّلًا. يحتاجه الوسيط أدناه
 * ليعرف هل تعذّرت قراءة جلسة هذا الطلب فيَسِم الرد بالترويسة.
 */
let activeFailoverStore: SessionFailoverStore | null = null;

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET environment variable is required. Set it before starting the server.");
  }

  const pgStoreFactory = connectPg(session);
  const sessionPool = getSessionFallbackPool();
  const pgStore = new pgStoreFactory({
    pool: sessionPool,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  let store: session.Store = pgStore;
  const redis = getRedisSessionAdapter();
  if (redis) {
    // Redis أساسي + Postgres احتياطي: عند انقطاع Upstash / Static IP
    // تفشل أوامر Redis خلال ~2.5s ثم تُخدم الجلسة من Neon بدل 502.
    const redisStore = new RedisStore({
      client: redis,
      prefix: "sess:",
      ttl: Math.floor(sessionTtl / 1000),
    });
    const failoverStore = new SessionFailoverStore(redisStore, pgStore);
    activeFailoverStore = failoverStore;
    store = failoverStore;
    console.log("[Session] Redis primary + isolated PostgreSQL failover (commandTimeout 2.5s)");
  } else {
    console.log("[Session] Using isolated PostgreSQL store (add REDIS_URL for Redis primary + failover)");
  }

  // Cross-subdomain cookie config (when frontend on Vercel and backend on
  // Frontend + API share a parent domain, e.g. sabq.org + api.sabq.org):
  //   COOKIE_DOMAIN=.sabq.org  → sets the cookie on the parent domain
  //   COOKIE_SAMESITE=none      → required for cross-site fetch credentials
  // For same-origin local dev, leave both unset (defaults below).
  // SameSite=None requires Secure=true; we enforce that combo explicitly.
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
  const cookieSameSite = (process.env.COOKIE_SAMESITE as "lax" | "strict" | "none" | undefined) || "lax";
  // Secure=true unconditional in production (security audit M11,
  // 2026-05-11). Old logic only enforced Secure when SameSite=none, so
  // a misconfigured prod with COOKIE_SAMESITE=lax + COOKIE_DOMAIN would
  // leak the session cookie over plain HTTP if the domain ever served
  // over HTTP. Production always = HTTPS, period.
  const cookieSecure = process.env.NODE_ENV === "production" || cookieSameSite === "none";

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
    // المعرّف يُلتقط من الكوكي **قبل** الوسيط: حين تعود القراءة فارغة يولّد
    // express-session معرّفًا جديدًا فورًا، فلا يعود req.sessionID هو المعرّف
    // الذي فشلت قراءته.
    const incomingSid = activeFailoverStore
      ? sessionIdFromCookieHeader(req.headers.cookie)
      : null;

    sessionMiddleware(req, res, (err?: any) => {
      if (err) return next(err);
      // تعذّرت قراءة الجلسة (لا أنها انتهت): نَسِم الرد كي تعيد الواجهة
      // المحاولة بدل عرض «انتهت صلاحية جلستك» وطرد المستخدم.
      if (incomingSid && activeFailoverStore?.consumeDegradedRead(incomingSid)) {
        res.setHeader(SESSION_DEGRADED_HEADER, "1");
      }
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
          const normalizedEmail = email.toLowerCase().trim();
          // Don't log the email (PII) or password-validity in production (S-06).
          const authDebug = process.env.NODE_ENV !== "production";
          if (authDebug) console.log("🔍 LocalStrategy: Checking user:", normalizedEmail);

          // Case-insensitive lookup, and match ALL rows sharing this email.
          // Some accounts exist as duplicate rows (e.g. a reader row + a writer
          // row from the application/approval flow). An admin "resend login
          // credentials" action rotates the password on ONE of those rows,
          // while login used to do a case-sensitive eq().limit(1) and could
          // land on the OTHER row → a freshly issued temp password reported as
          // "invalid". Validating against every candidate row makes the
          // password work regardless of which row holds it.
          // (Dedup the rows for good with scripts/merge-duplicate-accounts.ts.)
          const candidates = await db
            .select()
            .from(users)
            .where(sql`lower(${users.email}) = ${normalizedEmail}`);

          if (candidates.length === 0) {
            if (authDebug) console.log("❌ LocalStrategy: User not found");
            return done(null, false, { message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
          }

          if (authDebug) console.log(`✅ LocalStrategy: ${candidates.length} row(s) found, checking password`);

          let user: (typeof candidates)[number] | undefined;
          for (const candidate of candidates) {
            if (candidate.passwordHash && (await bcrypt.compare(password, candidate.passwordHash))) {
              user = candidate;
              break;
            }
          }

          if (!user) {
            if (!candidates.some((c) => c.passwordHash)) {
              if (authDebug) console.log("❌ LocalStrategy: No password hash");
              return done(null, false, { message: "هذا الحساب يحتاج إلى إعادة تعيين كلمة المرور" });
            }
            if (authDebug) console.log("🔑 LocalStrategy: Password valid? false");
            return done(null, false, { message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
          }

          if (authDebug) console.log("🔑 LocalStrategy: Password valid? true");

          // Block hard-negative account states (banned/deleted/suspended/locked;
          // "pending"/unverified stays allowed) — see canUserLogin in schema.
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
            if (process.env.NODE_ENV !== "production") {
              console.log("🔍 GoogleStrategy: Processing user:", profile.emails?.[0]?.value);
            }

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
                if (process.env.NODE_ENV !== "production") {
                  console.log("✅ AppleStrategy: Got name from first login:", firstName, lastName);
                }
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
      // v2: includes firstName/lastName/profileImageUrl for presence & avatars
      const cacheKey = `user:session:v2:${id}`;
      
      // Check cache first
      const cachedUser = memoryCache.get(cacheKey);
      if (cachedUser) {
        return done(null, cachedUser);
      }
      
      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }

      // Reject sessions of banned/suspended/deleted accounts on EVERY request —
      // deserialize is the choke point, so an admin ban/delete (or self-delete)
      // revokes web access immediately, even for a session that predates it
      // (audit #8: access revocation, not just password reset). The 60s cache is
      // cleared by invalidateAllUserSessions at ban/delete time so this is hit.
      if (!canUserLogin(user)) {
        return done(null, false);
      }

      // Include display fields used by presence / avatars. Omitting firstName
      // made /api/editor-presence fall back to the email local-part (e.g. alawijan1).
      const serializedUser = {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
        profileImageUrl: user.profileImageUrl ?? null,
        allowedLanguages: user.allowedLanguages || [],
        hasPressCard: user.hasPressCard || false,
      };

      // Cache for 60s (security audit H6, 2026-05-11). Was 5 min, which
      // meant a revoked role still granted access for up to that long
      // even after the admin updated user_roles. invalidateUserSessionCache()
      // is called from the role-mutation routes for instant takedown,
      // but the shorter TTL is a safety net if a callsite is missed.
      memoryCache.set(cacheKey, serializedUser, CACHE_TTL.SHORT);
      
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
  memoryCache.delete(`user:session:v2:${userId}`);
}

/**
 * Hard-invalidate EVERY server-side session for a user. Call on any password
 * change/reset so a stolen cookie/bearer token can't outlive the reset — the
 * old code only updated passwordHash, leaving live sessions valid (audit #8).
 *
 * Clears all three: web sessions in BOTH stores (Redis `sess:*` + the Postgres
 * `sessions` table), mobile bearer sessions (`appMemberSessions`), and the
 * deserialize cache. Best-effort per store — a failure in one is logged but
 * never thrown into the caller's reset flow. Password resets are rare, so the
 * Redis scan cost is acceptable.
 */
export async function invalidateAllUserSessions(
  userId: string,
  opts?: { exceptWebSid?: string; exceptMobileTokenHash?: string },
): Promise<void> {
  invalidateUserSessionCache(userId);

  // Mobile bearer tokens (keep the caller's own token on a self-service change).
  try {
    const cond = opts?.exceptMobileTokenHash
      ? and(eq(appMemberSessions.memberId, userId), ne(appMemberSessions.tokenHash, opts.exceptMobileTokenHash))
      : eq(appMemberSessions.memberId, userId);
    await db.delete(appMemberSessions).where(cond);
  } catch (e) {
    console.error("[Session] appMemberSessions purge failed:", e);
  }

  // Postgres session store (connect-pg-simple: table `sessions`, jsonb `sess`).
  try {
    const pool = getSessionFallbackPool();
    if (opts?.exceptWebSid) {
      await pool.query(
        `DELETE FROM sessions WHERE (sess #>> '{passport,user}') = $1 AND sid <> $2`,
        [userId, opts.exceptWebSid],
      );
    } else {
      await pool.query(`DELETE FROM sessions WHERE (sess #>> '{passport,user}') = $1`, [userId]);
    }
  } catch (e) {
    console.error("[Session] Postgres session purge failed:", e);
  }

  // Redis session store (connect-redis, prefix `sess:`).
  //
  // كان هذا المقطع يمشّط مفاتيح Redis كلها (SCAN sess:*) مع GET **متسلسل**
  // لكل مفتاح. مع N جلسة نشطة فهذه N رحلة ذهاب وإياب متتابعة، وRedis أحادي
  // الخيط: كل أمر آخر يقف في الطابور خلفها — بما فيه قراءة الجلسة التي
  // يجريها express-session في **كل** طلب وارد قبل أي مسار. أثر ذلك في
  // سجلات 2026-07-24/25 كان تجمّدًا عامًا: طلبات لمسارات لا تجمعها صلة
  // تنتهي كلها في نفس المللي ثانية (1258/1263/1260/1262/1262)، ونقاط مكاشة
  // في ذاكرة العملية تستغرق ثانية ونصفًا لأن الطلب لم يبلغ معالجها أصلًا.
  // والدالة موصولة بأربعة عشر موضعًا (حظر، حذف، تزويد إداري، اعتماد مراسل)
  // لا بإعادة تعيين كلمة المرور النادرة وحدها كما افترض التعليق الأصلي.
  //
  // المسار السريع الآن: الفهرس العكسي usess:<userId> الذي يبنيه
  // SessionFailoverStore.set — SMEMBERS واحد ثم DEL واحد، بعدد جلسات
  // المستخدم لا بعدد جلسات الموقع.
  try {
    const redis = getRedisSessionAdapter();
    if (redis) {
      const indexKey = `usess:${userId}`;
      let indexedSids: string[] = [];
      try {
        indexedSids = await redis.smembers(indexKey);
      } catch {
        /* الفهرس غير متاح — نسقط إلى التمشيط المحدود أدناه */
      }

      if (indexedSids.length > 0) {
        const doomed = indexedSids
          .filter((sid) => sid !== opts?.exceptWebSid)
          .map((sid) => `sess:${sid}`);
        if (doomed.length > 0) await redis.del(doomed);
        await redis.del(indexKey);
        // الجلسة المستثناة (تغيير ذاتي لكلمة المرور) تبقى مفهرسة.
        if (opts?.exceptWebSid) {
          void redis.sadd(indexKey, opts.exceptWebSid).catch(() => {});
        }
      } else {
        // احتياطي: جلسات أُنشئت قبل وجود الفهرس. تمشيط بـMGET على دفعات
        // (رحلة واحدة لكل دفعة بدل رحلة لكل مفتاح) وبميزانية صارمة —
        // تجاوزها يُسجَّل ولا يُمدَّد، فحجب Redis أسوأ من إبطال ناقص.
        const keepKey = opts?.exceptWebSid ? `sess:${opts.exceptWebSid}` : null;
        const startedAt = Date.now();
        const budgetMs = Number(process.env.SESSION_PURGE_BUDGET_MS) || 1_500;
        const maxKeys = Number(process.env.SESSION_PURGE_MAX_KEYS) || 20_000;
        let scanned = 0;
        let cursor = "0";
        do {
          const [next, keys] = (await redis.scan(
            cursor,
            "MATCH",
            "sess:*",
            "COUNT",
            500,
          )) as [string, string[]];
          cursor = next;
          if (keys.length > 0) {
            scanned += keys.length;
            const values = await redis.mget(keys);
            const doomed: string[] = [];
            for (let i = 0; i < keys.length; i++) {
              const key = keys[i];
              if (key === keepKey) continue;
              const raw = values[i];
              if (!raw) continue;
              try {
                if (JSON.parse(raw)?.passport?.user === userId) doomed.push(key);
              } catch {
                /* skip non-JSON session payloads */
              }
            }
            if (doomed.length > 0) await redis.del(doomed);
          }
          if (scanned >= maxKeys || Date.now() - startedAt > budgetMs) {
            console.warn(
              `[Session] نفدت ميزانية تمشيط الجلسات (فُحص ${scanned} مفتاحًا في ${Date.now() - startedAt}ms) — توقف قبل إكمال إبطال ${userId}`,
            );
            break;
          }
        } while (cursor !== "0");
      }
    }
  } catch (e) {
    console.error("[Session] Redis session purge failed:", e);
  }
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
