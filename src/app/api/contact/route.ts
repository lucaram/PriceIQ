// src/app/api/contact/route.ts
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { kv } from "@vercel/kv";

export const runtime = "nodejs";

/**
 * Hardened contact endpoint for Vercel:
 * - strict server-side validation (don’t trust client)
 * - origin allowlist check (basic CSRF protection)
 * - GLOBAL rate limiting via Vercel KV / Upstash (works across regions/instances)
 * - honeypot support (optional from client, won’t break if absent)
 * - control-char stripping (avoid header/log weirdness)
 * - small response hardening (no detail leakage)
 *
 * Env vars used:
 * - RESEND_API_KEY
 * - CONTACT_TO_EMAIL
 * - CONTACT_FROM_EMAIL
 * - ALLOWED_ORIGINS (comma-separated)
 *
 * Note:
 * - Vercel KV auto-provides KV_* env vars. You DO NOT need UPSTASH_* vars
 *   when using @vercel/kv (it reads KV_REST_API_URL / KV_REST_API_TOKEN internally).
 */

// ---------- Config ----------
const LIMITS = {
  nameMin: 2,
  nameMax: 50,
  emailMax: 50,
  companyMax: 50,
  messageMin: 10,
  messageMax: 200,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Rate limit policy: 6 requests / 10 minutes / IP
const RL_WINDOW_SECONDS = 10 * 60;
const RL_MAX = 6;

const RL_PREFIX = "priceiq:contact"; // key namespace in KV

// ---------- Origin allowlist ----------
function getAllowedOrigins() {
  const raw = (process.env.ALLOWED_ORIGINS || "").trim();
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function originAllowed(req: Request) {
  const allowed = getAllowedOrigins();
  if (allowed.length === 0) return true; // if not configured, don't block (but recommended to set)
  const origin = req.headers.get("origin") || "";
  return allowed.includes(origin);
}

// ---------- Helpers ----------
function stripControlChars(s: string) {
  // remove ASCII control chars (incl CR/LF/TAB) that can cause header/log issues
  return s.replace(/[\u0000-\u001F\u007F]/g, "");
}

function clampLen(s: string, max: number) {
  return s.length > max ? s.slice(0, max) : s;
}

function normalizeEmail(s: string) {
  // emails cannot contain whitespace; remove it and lowercase for consistency
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

function isValidEmail(s: string) {
  // explicit whitespace rejection + basic format check
  if (/\s/.test(s)) return false;
  return EMAIL_RE.test(s);
}

function safeTextLine(s: string) {
  // one-liner safe for headers/logs
  return stripControlChars(s).replace(/\s+/g, " ").trim();
}

function getClientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0]?.trim();
  return first || "0.0.0.0";
}

function validate(body: any) {
  // Accept optional honeypot field: "website" or "_hp"
  const nameRaw = String(body?.name ?? "");
  const emailRaw = String(body?.email ?? "");
  const companyRaw = String(body?.company ?? "");
  const messageRaw = String(body?.message ?? "");
  const pageRaw = String(body?.page ?? "");
  const honeypot = String(body?.website ?? body?._hp ?? "").trim();

  const name = clampLen(stripControlChars(nameRaw), LIMITS.nameMax).trim();
  const email = clampLen(stripControlChars(emailRaw), 200); // normalize after
  const company = clampLen(stripControlChars(companyRaw), LIMITS.companyMax).trim();
  const message = clampLen(stripControlChars(messageRaw), LIMITS.messageMax).trim();
  const page = clampLen(stripControlChars(pageRaw), 300).trim();

  const errors: Partial<Record<"name" | "email" | "company" | "message", string>> = {};

  // Name: human-ish allowed chars
  if (name.length < LIMITS.nameMin) errors.name = `Name must be at least ${LIMITS.nameMin} characters.`;
  else if (name.length > LIMITS.nameMax) errors.name = `Name must be at most ${LIMITS.nameMax} characters.`;
  else if (!/^[\p{L}\p{M} .'’-]+$/u.test(name)) errors.name = "Name contains invalid characters.";

  // Email
  const emailNorm = normalizeEmail(email);
  if (emailNorm.length < 3) errors.email = "Please enter a valid email address.";
  else if (emailNorm.length > LIMITS.emailMax) errors.email = `Email must be at most ${LIMITS.emailMax} characters.`;
  else if (!isValidEmail(emailNorm)) errors.email = "Please enter a valid email address.";

  // Company optional
  if (company.length > 0) {
    if (company.length > LIMITS.companyMax) errors.company = `Company must be at most ${LIMITS.companyMax} characters.`;
    else if (!/^[\p{L}\p{M}0-9 &.,'’()\-]+$/u.test(company)) errors.company = "Company contains invalid characters.";
  }

  // Message
  if (message.length < LIMITS.messageMin) errors.message = `Message must be at least ${LIMITS.messageMin} characters.`;
  else if (message.length > LIMITS.messageMax) errors.message = `Message must be at most ${LIMITS.messageMax} characters.`;

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    normalized: {
      name,
      email: emailNorm,
      company,
      message,
      page,
      honeypot,
    },
  };
}

// ---------- GLOBAL rate limiter via Vercel KV ----------
async function rateLimit(ip: string) {
  // Sliding-ish window using fixed window counter (simple + effective)
  // Key resets via expire; global across regions/instances.
  const key = `${RL_PREFIX}:ip:${ip}`;

  const count = await kv.incr(key); // atomic
  if (count === 1) {
    await kv.expire(key, RL_WINDOW_SECONDS);
  }

  return {
    ok: count <= RL_MAX,
    remaining: Math.max(0, RL_MAX - count),
    // We don't have exact reset timestamp unless we store it; we'll return a conservative Retry-After.
    retryAfterSeconds: RL_WINDOW_SECONDS,
  };
}

export async function POST(req: Request) {
  try {
    // Content-Type check
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      return NextResponse.json({ error: "Invalid content type." }, { status: 415 });
    }

    // Origin allowlist (basic CSRF guard)
    if (!originAllowed(req)) {
      return NextResponse.json({ error: "Blocked origin." }, { status: 403 });
    }

    // Global rate limit (Vercel KV / Upstash)
    const ip = getClientIp(req);
    const rl = await rateLimit(ip);

    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rl.retryAfterSeconds),
          },
        }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const check = validate(body);

    // Honeypot: if filled, pretend success (don’t teach bots)
    if (check.normalized.honeypot) {
      return NextResponse.json({ ok: true });
    }

    if (!check.ok) {
      return NextResponse.json(
        { error: "Please correct the highlighted fields.", fieldErrors: check.errors },
        { status: 400 }
      );
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return NextResponse.json({ error: "Server not configured." }, { status: 500 });
    }

    const resend = new Resend(resendKey);

    // Private inbox (never shown to users)
    const to = process.env.CONTACT_TO_EMAIL || "luca_ram@hotmail.com";
    // Must be verified sender/domain in Resend
    const from = process.env.CONTACT_FROM_EMAIL || "PriceIQ <no-reply@yourdomain.com>";

    const subject = `PriceIQ inquiry — ${safeTextLine(check.normalized.name)}${
      check.normalized.company ? ` (${safeTextLine(check.normalized.company)})` : ""
    }`;

    const text =
      `New message from PriceIQ contact modal\n\n` +
      `Name: ${safeTextLine(check.normalized.name)}\n` +
      `Email: ${safeTextLine(check.normalized.email)}\n` +
      `Company: ${check.normalized.company ? safeTextLine(check.normalized.company) : "-"}\n` +
      `Page: ${check.normalized.page ? safeTextLine(check.normalized.page) : "-"}\n` +
      `IP: ${ip}\n\n` +
      `Message:\n${check.normalized.message}\n`;

    await resend.emails.send({
      from,
      to,
      subject,
      text,
      replyTo: check.normalized.email, // safe after validation/normalization
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error sending message." }, { status: 500 });
  }
}
