import 'dotenv/config';
import { operationFailure, databaseFailure } from './src/db/errors.ts';
import { answerEventQuestion } from './src/lib/event-answers.ts';
import express from 'express';
import { createRateLimiter } from './src/middleware/rate-limit.ts';
import { AUVRESENCE_INSTRUCTIONS, conversationPrompt, type PlatformAction } from './src/lib/conversation.ts';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { z } from 'zod';
import {
  RECOGNISED_DEMO_UIDS,
  optionalAuth,
  areDemoIdentitiesEnabled,
  areDebugToolsEnabled,
  createShowcaseToken,
  isShowcaseModeEnabled,
  requireAuth,
  verifyShowcaseToken,
  type AuthRequest,
} from './src/middleware/auth.ts';
import { adminAuth } from './src/lib/firebase-admin.ts';
import {
  checkDatabaseHealth,
  inspectDatabaseHealth,
  computeVenueRoute,
  createAnnouncementByOrganiser,
  createEventByUser,
  createFloorByOrganiser,
  createResourceByOrganiser,
  createSessionByOrganiser,
  createVenueByOrganiser,
  createVenueEdgeByOrganiser,
  deleteVenueEdgeByOrganiser,
  ensureShowcaseDataSeeded,
  getApplicationById,
  getEventFullContext,
  getIsolationFixtureEventId,
  getOrCreateUser,
  getOrganiserDashboardData,
  getPeerApplicationIdForIsolationTest,
  getPublishedEvents,
  getUserJourneys,
  getWaypointTokenForVenue,
  EventAccessDeniedError,
  isUserOrganiserForEvent,
  recordParticipantWaypointScan,
  resetGoldenPathDemoState,
  reviewApplicationByOrganiser,
  submitParticipantApplication,
  switchUserActiveRole,
  updateCredentialById,
  updateCredentialStatusByOrganiser,
  updateEventConfigByOrganiser,
  updateFloorPathByOrganiser,
  updateSessionByOrganiser,
  updateVenueByOrganiser,
  verifyPublicCredentialByToken,
} from './src/db/queries.ts';
import {
  AiNotConfiguredError,
  VisionNotConfiguredError,
  VoiceNotConfiguredError,
  analyseParticipantEventImage,
  buildDeterministicFallbackBriefing,
  generateAskAuvresenceResponse,
  generatePlatformResponse,
  generateParticipantBriefing,
  isAiConfigured,
  isSttConfigured,
  isTtsConfigured,
  isVisionConfigured,
  isVoiceConfigured,
  synthesiseAuvresenceSpeech,
  transcribeParticipantSpeech,
  type AuthorisedParticipantAIContext,
} from './src/lib/ai.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  const json = res.json.bind(res);
  res.json = (body: any) => {
    if (res.statusCode >= 400 && body && typeof body === 'object' && !body.code) {
      body.code = ({ 400: 'VALIDATION_ERROR', 401: 'AUTHENTICATION_FAILED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 503: 'DATABASE_UNAVAILABLE' } as Record<number, string>)[res.statusCode] || 'REQUEST_FAILED';
    }
    return json(body);
  };
  next();
});
app.use('/api/ai', createRateLimiter());
app.use(express.json({ limit: '6mb' }));
// Hybrid routes reject a supplied invalid identity rather than silently becoming a guest.
app.use(['/api/events', '/api/ai/ask'], optionalAuth);

function sendFailure(res: Response, error: unknown, message: string) {
  console.error(message, error);
  const failure = operationFailure(error);
  return res.status(failure?.status || 500).json(failure || { code: 'REQUEST_FAILED', error: message });
}

// Helper to optionally resolve authenticated user on hybrid endpoints
async function resolveOptionalUser(req: AuthRequest) { return req.dbUser || null; }

// ============================================================================
// SAFE OPERATIONAL HEALTH ENDPOINT (SECTION 38)
// ============================================================================

async function handleHealthCheck(_req: Request, res: Response) {
  const dbStatus = await inspectDatabaseHealth();
  const dbHealthy = dbStatus.connected && dbStatus.schemaReady;
  const aiReady = isAiConfigured();
  const voiceReady = isVoiceConfigured();
  const sttReady = isSttConfigured();
  const ttsReady = isTtsConfigured();
  const visionReady = isVisionConfigured();
  const showcaseMode = isShowcaseModeEnabled();

  return res.status(dbHealthy ? 200 : 503).json({
    server: true,
    database: dbHealthy ? 'available' : dbStatus.connected ? 'needs-schema-update' : 'unavailable',
    schemaReady: dbStatus.schemaReady,
    ai: aiReady ? 'configured' : 'unconfigured',
    voice: voiceReady ? 'configured' : 'unconfigured',
    vision: visionReady ? 'configured' : 'unconfigured',
    showcaseMode,
    debugToolsEnabled: areDebugToolsEnabled(),
    demoIdentitiesEnabled: areDemoIdentitiesEnabled(),
    // Boolean flags for UI components
    databaseReady: dbHealthy,
    aiConfigured: aiReady,
    voiceConfigured: voiceReady,
    sttConfigured: sttReady,
    ttsConfigured: ttsReady,
    visionConfigured: visionReady,
  });
}

app.get('/health', handleHealthCheck);
app.get('/api/health', handleHealthCheck);

// ============================================================================
// ZOD VALIDATION SCHEMAS (LAYER 4 — INPUT VALIDATION)
// ============================================================================

const DemoSessionSchema = z.object({
  account: z.enum(['PARTICIPANT_A', 'ORGANISER_B']),
});

const SwitchRoleSchema = z.object({
  role: z.enum(['PARTICIPANT', 'ORGANISER']),
});

const ApplicationSubmitSchema = z.object({
  applicantName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional(),
  institution: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(120),
  statement: z.string().trim().min(15).max(2000),
  customAnswer: z.string().trim().max(1000).optional(),
});

const isValidTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const isoDateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a calendar date (YYYY-MM-DD).')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Invalid date.');

const CreateEventSchema = z
  .object({
    // Minimum fields captured by the Organise-an-Event experience
    title: z.string().trim().min(3).max(160),
    eventType: z.string().trim().min(2).max(60),
    description: z.string().trim().min(10).max(2000),
    startDate: isoDateOnly,
    endDate: isoDateOnly,
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .refine(isValidTimezone, 'Unknown timezone.'),
    location: z.string().trim().min(2).max(140),
    // Optional refinements — derived server-side when omitted
    subtitle: z.string().trim().min(3).max(220).optional(),
    organisationName: z.string().trim().min(2).max(140).optional(),
    organisationHq: z.string().trim().min(2).max(140).optional(),
    datesLabel: z.string().trim().min(2).max(100).optional(),
    expectedParticipants: z.number().int().min(1).max(100000).optional(),
    visibility: z.enum(['PUBLIC', 'UNLISTED', 'PRIVATE']).optional(),
    applicationStatus: z.enum(['COMING_SOON', 'OPEN', 'CLOSED']).optional(),
    applicationConfig: z
      .object({
        requirePhone: z.boolean(),
        customQuestionLabel: z.string().max(240),
        customQuestionRequired: z.boolean(),
      })
      .optional(),
    venueName: z.string().trim().max(160).optional(),
    venueAddress: z.string().trim().max(240).optional(),
    categories: z.array(z.string().trim().min(2).max(100)).max(50).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'End date must be on or after the start date.',
    path: ['endDate'],
  });

function formatDatesLabel(startIso: string, endIso: string): string {
  const fmt = (iso: string, withYear: boolean) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
  if (startIso === endIso) return fmt(startIso, true);
  return `${fmt(startIso, false)} – ${fmt(endIso, true)}`;
}

// Role-based gate. Real (Firebase) accounts are ONE account that can both
// participate and organise, so their authority comes from per-event organiser
// membership (Layer 3). The activeRole gate is retained only for the seeded
// showcase identities used by the Security Inspector.
function organiserRoleGateAllows(user: { isDemoSeed: boolean; activeRole: string }) {
  return user.isDemoSeed ? user.activeRole === 'ORGANISER' : true;
}

const UpdateEventConfigSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  eventType: z.string().trim().min(2).max(60).optional(),
  startDate: isoDateOnly.optional(),
  endDate: isoDateOnly.optional(),
  subtitle: z.string().trim().min(3).max(220).optional(),
  description: z.string().trim().min(10).max(2000).optional(),
  location: z.string().trim().min(2).max(140).optional(),
  datesLabel: z.string().trim().min(2).max(100).optional(),
  timezone: z.string().trim().max(60).refine(isValidTimezone, 'Unknown timezone.').optional(),
  expectedParticipants: z.number().int().min(1).max(100000).optional(),
  visibility: z.enum(['PUBLIC', 'UNLISTED', 'PRIVATE']).optional(),
  applicationStatus: z.enum(['COMING_SOON', 'OPEN', 'CLOSED']).optional(),
  applicationConfig: z
    .object({
      requirePhone: z.boolean(),
      customQuestionLabel: z.string().max(240),
      customQuestionRequired: z.boolean(),
    })
    .optional(),
  venueName: z.string().trim().max(160).optional(),
  venueAddress: z.string().trim().max(240).optional(),
  venuePublished: z.boolean().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'LIVE', 'ARCHIVED']).optional(),
  categories: z.array(z.string().trim().min(2).max(100)).max(50).optional(),
});

const ReviewApplicationSchema = z.object({
  status: z.enum(['ACCEPTED', 'REJECTED', 'UNDER_REVIEW']),
});

const UpdateCredentialStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'REVOKED']),
});

const SessionMutationSchema = z.object({
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().min(4).max(1000),
  speaker: z.string().trim().max(140).optional(),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Use a valid 24-hour HH:MM time'),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Use a valid 24-hour HH:MM time'),
  dayLabel: z.string().trim().min(2).max(80).default('Day 1'),
  track: z.string().trim().min(2).max(100).default('General'),
  // Optional: a session can exist before a venue/place has been built.
  venueId: z.number().int().positive().nullable().optional(),
  status: z.enum(['COMPLETED', 'HAPPENING_NOW', 'UP_NEXT', 'UPCOMING']),
}).refine(value => value.endTime > value.startTime, { message: 'End time must be after start time.', path: ['endTime'] });

const AnnouncementCreateSchema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(5).max(2000),
  announcementType: z.string().trim().max(40).optional(),
  attachedVenueId: z.number().int().positive().nullable().optional(),
  attachedSessionId: z.number().int().positive().nullable().optional(),
  audience: z.enum(['ALL_APPLICANTS', 'ACCEPTED_ONLY', 'ORGANISERS_ONLY']),
  priority: z.enum(['STANDARD', 'IMPORTANT', 'URGENT']).default('STANDARD'),
});

const VenueCreateSchema = z.object({
  floorId: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(2).max(80),
  shortDescription: z.string().trim().min(4).max(400),
  floor: z.string().trim().min(2).max(40),
  zone: z.string().trim().min(2).max(80),
  poiType: z.string().trim().max(40).optional(),
  poiCategory: z.string().trim().max(40).optional(),
  operationalStatus: z
    .enum(['OPEN', 'CLOSED', 'TEMPORARILY_UNAVAILABLE'])
    .optional(),
  accessible: z.boolean().optional(),
  connectedFloors: z.array(z.string()).optional(),
  mapX: z.number().int().min(5).max(95),
  mapY: z.number().int().min(5).max(95),
  capacity: z.number().int().positive().max(5000).optional(),
});

const VenueUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  shortDescription: z.string().trim().min(4).max(400),
  floor: z.string().trim().min(2).max(40),
  zone: z.string().trim().min(2).max(80),
  poiType: z.string().trim().max(40).default('ROOM'),
  poiCategory: z.string().trim().max(40).default('EVENT'),
  operationalStatus: z
    .enum(['OPEN', 'CLOSED', 'TEMPORARILY_UNAVAILABLE'])
    .default('OPEN'),
  accessible: z.boolean().default(true),
  connectedFloors: z.array(z.string()).optional(),
  mapX: z.number().int().min(5).max(95),
  mapY: z.number().int().min(5).max(95),
  capacity: z.number().int().positive().max(5000).nullable().optional(),
});

const FloorCreateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  levelOrder: z.number().int().min(-5).max(100),
  description: z.string().trim().max(300).optional(),
  recordedPath: z
    .array(z.object({ x: z.number(), y: z.number() }))
    .optional(),
  recordedDistanceMeters: z.number().int().min(0).max(5000).optional(),
});

const FloorPathUpdateSchema = z.object({
  description: z.string().trim().max(300).optional(),
  recordedPath: z.array(z.object({ x: z.number(), y: z.number() })),
  recordedDistanceMeters: z.number().int().min(0).max(10000),
});

const VenueEdgeCreateSchema = z.object({
  fromVenueId: z.number().int().positive(),
  toVenueId: z.number().int().positive(),
  distanceMeters: z.number().int().min(1).max(2000).default(25),
  accessible: z.boolean().default(true),
  isCrossFloor: z.boolean().default(false),
});

const ResourceCreateSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().min(5).max(600),
  url: z.string().trim().min(3).max(500),
  category: z.string().trim().min(2).max(60),
  audience: z.enum(['ALL_APPLICANTS', 'ACCEPTED_ONLY']),
});

const WaypointScanSchema = z.object({
  waypointToken: z.string().trim().min(5).max(120),
});

const AskAISchema = z.object({
  eventId: z.number().int().positive().optional(),
  question: z.string().trim().min(2).max(500),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(1500) }).strict()).max(6).optional(),
}).strict();

const VoiceAskSchema = z.object({
  eventId: z.number().int().positive(),
  audioBase64: z.string().min(16),
  mimeType: z.string().optional(),
});

const TtsSpeakSchema = z.object({
  text: z.string().trim().min(2).max(1200),
});

const VisionAnalyseSchema = z.object({
  eventId: z.number().int().positive(),
  imageDataUrl: z.string().startsWith('data:image/'),
  question: z.string().trim().max(400).optional(),
});

const BriefMeSchema = z.object({
  eventId: z.number().int().positive(),
});

const ResetDemoSchema = z.object({
  mode: z.enum(['STEP_1_UNAPPLIED', 'ACCEPTED_READY']),
});

// ============================================================================
// AUTHENTICATION & SHOWCASE SESSION ROUTES (LOCKED BY SHOWCASE_MODE)
// ============================================================================

app.post('/api/auth/demo-session', async (req: Request, res: Response) => {
  try {
    if (!areDemoIdentitiesEnabled()) {
      return res.status(403).json({
        error: 'Showcase demo sessions are disabled (SHOWCASE_MODE=false).',
        code: 'SHOWCASE_MODE_DISABLED',
      });
    }

    await ensureShowcaseDataSeeded();
    const parsed = DemoSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed: Invalid showcase account selection.',
        layer: 'LAYER_4_VALIDATION',
        issues: parsed.error.issues,
      });
    }

    const isParticipant = parsed.data.account === 'PARTICIPANT_A';
    const profile = isParticipant
      ? {
          uid: 'auvresence-demo-participant-shaurya',
          email: 'shaurya.demo@auvresence.showcase',
          name: 'Shaurya Agrawal',
        }
      : {
          uid: 'auvresence-demo-organiser-arjun',
          email: 'organiser.demo@auvresence.showcase',
          name: 'Showcase Organiser (Account B)',
        };

    const user = await getOrCreateUser(
      profile.uid,
      profile.email,
      profile.name,
      true
    );
    await switchUserActiveRole(
      user.id,
      isParticipant ? 'PARTICIPANT' : 'ORGANISER'
    );

    const token = createShowcaseToken({
      uid: profile.uid,
      email: profile.email,
      name: profile.name,
      exp: Date.now() + 12 * 60 * 60 * 1000,
    });

    const updatedUser = await getOrCreateUser(
      profile.uid,
      profile.email,
      profile.name,
      true
    );

    return res.json({
      token,
      user: updatedUser,
      authSource: 'showcase_hmac',
      showcaseMode: true,
    });
  } catch (error: any) {
    console.error('Failed to create demo session:', error);
    return sendFailure(res, error, 'Failed to initialise session.');
  }
});

app.get('/api/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await ensureShowcaseDataSeeded();
    const dbUser = req.dbUser!;
    const allEvents = await getPublishedEvents();
    const organiserEventIds: number[] = [];
    for (const ev of allEvents) {
      const allowed = await isUserOrganiserForEvent(dbUser.id, ev.id);
      if (allowed) organiserEventIds.push(ev.id);
    }

    return res.json({
      user: dbUser,
      authSource: req.user?.authSource || 'firebase',
      organiserEventIds,
      showcaseMode: isShowcaseModeEnabled(),
    });
  } catch (error: any) {
    return sendFailure(res, error, 'Failed to load profile.');
  }
});

app.post(
  '/api/auth/switch-role',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!isShowcaseModeEnabled()) {
        return res.status(403).json({
          error: 'Role switching is restricted when SHOWCASE_MODE=false.',
        });
      }

      if (!req.dbUser!.isDemoSeed) {
        return res.status(403).json({
          error: 'Role switching is only available to showcase identities.',
          layer: 'LAYER_2_AUTHORIZATION',
        });
      }

      const parsed = SwitchRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid role specified.',
          layer: 'LAYER_4_VALIDATION',
          issues: parsed.error.issues,
        });
      }

      const updated = await switchUserActiveRole(
        req.dbUser!.id,
        parsed.data.role
      );
      return res.json({ user: updated });
    } catch (error: any) {
      return sendFailure(res, error, 'Failed to switch role.');
    }
  }
);

// ============================================================================
// PUBLIC & PARTICIPANT EVENT ROUTES
// ============================================================================

app.get('/api/me/journeys', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const journeys = await getUserJourneys(req.dbUser!.id);
    return res.json(journeys);
  } catch (error: any) {
    return sendFailure(res, error, 'Failed to load user journeys.');
  }
});

app.post('/api/events', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = CreateEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Event validation failed. Please check all required fields.',
        layer: 'LAYER_4_VALIDATION',
        issues: parsed.error.issues,
      });
    }

    const d = parsed.data;
    const owner = req.dbUser!;
    const created = await createEventByUser({
      // Ownership is ALWAYS derived from the verified identity, never the body.
      userId: owner.id,
      userEmail: owner.email,
      isDemoUser: owner.isDemoSeed,
      ...d,
      // Type is stored in its own column — never folded into the subtitle.
      subtitle: d.subtitle ?? '',
      organisationName:
        d.organisationName ??
        (owner.displayName && owner.displayName.length >= 2
          ? owner.displayName
          : 'Independent Organiser'),
      organisationHq: d.organisationHq ?? d.location,
      datesLabel: d.datesLabel ?? formatDatesLabel(d.startDate, d.endDate),
    });

    return res.status(201).json({ event: created });
  } catch (error: any) {
    console.error('Event creation failed:', error);
    const failure = databaseFailure(error);
    if (failure) return res.status(failure.status).json(failure);
    return res.status(500).json({ code: 'EVENT_CREATE_FAILED', error: 'Could not create your event. Your details are kept here; please try again.' });
  }
});

app.get('/api/events', async (_req: Request, res: Response) => {
  try {
    const showcase = isShowcaseModeEnabled();
    const list = (await getPublishedEvents()).filter(
      (e) =>
        e.visibility === 'PUBLIC' &&
        (showcase || !e.isDemoSeed) &&
        (e.status === 'LIVE' || e.status === 'PUBLISHED')
    );
    return res.json({ events: list });
  } catch (error: any) {
    return sendFailure(res, error, 'Failed to load events.');
  }
});

app.get(
  '/api/events/:eventId/context',
  async (req: AuthRequest, res: Response) => {
    try {
      const eventId = Number(req.params.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        return res.status(400).json({
          error: 'Invalid event ID parameter.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      const optionalUser = await resolveOptionalUser(req);
      const context = await getEventFullContext(eventId, optionalUser?.id);
      if (!context) {
        return res.status(404).json({ error: 'Event not found.' });
      }

      return res.json(context);
    } catch (error: any) {
      // PRIVATE events look non-existent to people without access.
      if (error instanceof EventAccessDeniedError) {
        return res.status(404).json({ error: 'Event not found.' });
      }
      return sendFailure(res, error, 'Failed to load event context.');
    }
  }
);

app.post(
  '/api/events/:eventId/apply',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const eventId = Number(req.params.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        return res.status(400).json({
          error: 'Invalid event ID parameter.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      const parsed = ApplicationSubmitSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error:
            'Application validation failed. Please check all required fields.',
          layer: 'LAYER_4_VALIDATION',
          issues: parsed.error.issues,
        });
      }

      const created = await submitParticipantApplication({
        eventId,
        userId: req.dbUser!.id,
        applicantName: parsed.data.applicantName,
        applicantEmail: req.dbUser!.email,
        phone: parsed.data.phone,
        institution: parsed.data.institution,
        category: parsed.data.category,
        statement: parsed.data.statement,
        customAnswer: parsed.data.customAnswer,
        isDemoUser: req.dbUser!.isDemoSeed,
      });

      return res.status(201).json({ application: created });
    } catch (error: any) {
      return sendFailure(res, error, 'Failed to submit application.');
    }
  }
);

app.get(
  '/api/events/:eventId/route',
  async (req: AuthRequest, res: Response) => {
    try {
      const eventId = Number(req.params.eventId);
      const fromVenueId = Number(req.query.fromVenueId);
      const toVenueId = Number(req.query.toVenueId);
      const accessibleOnly = req.query.accessibleOnly === 'true';

      if (
        !Number.isInteger(eventId) ||
        eventId <= 0 ||
        !Number.isInteger(fromVenueId) ||
        fromVenueId <= 0 ||
        !Number.isInteger(toVenueId) ||
        toVenueId <= 0
      ) {
        return res.status(400).json({
          error: 'Valid eventId, fromVenueId, and toVenueId are required.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      const routeUser = await resolveOptionalUser(req);
      const context = await getEventFullContext(eventId, routeUser?.id);
      if (!context) {
        return res.status(404).json({ error: 'Event not found.' });
      }

      const route = computeVenueRoute({
        venues: context.venues,
        edges: context.edges,
        fromVenueId,
        toVenueId,
        accessibleOnly,
      });

      return res.json(route);
    } catch (error: any) {
      if (error instanceof EventAccessDeniedError) {
        return res.status(404).json({ error: 'Event not found.' });
      }
      return sendFailure(res, error, 'Failed to compute route.');
    }
  }
);

// Resource-isolated application lookup (Layer 3 — Resource Isolation / BOLA defense)
app.get(
  '/api/applications/:applicationId',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const applicationId = Number(req.params.applicationId);
      if (!Number.isInteger(applicationId) || applicationId <= 0) {
        return res.status(400).json({
          error: 'Invalid application ID.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      const application = await getApplicationById(applicationId);
      if (!application) {
        return res.status(404).json({ error: 'Application not found.' });
      }

      const isOwner = application.userId === req.dbUser!.id;
      const isAuthorisedOrganiser = await isUserOrganiserForEvent(
        req.dbUser!.id,
        application.eventId
      );

      if (!isOwner && !isAuthorisedOrganiser) {
        return res.status(403).json({
          error:
            'Forbidden: Resource Isolation violation. You are not authorised to view another participant’s private application.',
          layer: 'LAYER_3_RESOURCE_ISOLATION',
        });
      }

      return res.json({ application: isAuthorisedOrganiser ? application : { ...application, reviewedByUserId: undefined } });
    } catch (error: any) {
      return sendFailure(res, error, 'Failed to retrieve application.');
    }
  }
);

// ============================================================================
// ORGANISER COMMAND CENTRE ROUTES (LAYER 2 & LAYER 3 ENFORCED)
// ============================================================================

app.get(
  '/api/organiser/events/:eventId/dashboard',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const eventId = Number(req.params.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        return res.status(400).json({
          error: 'Invalid event ID.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      if (!organiserRoleGateAllows(req.dbUser!)) {
        return res.status(403).json({
          error:
            'Forbidden: Participant role cannot access Organiser Command Centre.',
          layer: 'LAYER_2_AUTHORIZATION',
        });
      }

      const allowed = await isUserOrganiserForEvent(req.dbUser!.id, eventId);
      if (!allowed) {
        return res.status(403).json({
          error:
            'Forbidden: Organiser is not authorised to administer this isolated event.',
          layer: 'LAYER_3_RESOURCE_ISOLATION',
        });
      }

      const data = await getOrganiserDashboardData(eventId);
      return res.json(data);
    } catch (error: any) {
      return res.status(500).json({
        error: 'Failed to load organiser dashboard.',
      });
    }
  }
);

app.patch(
  '/api/organiser/applications/:applicationId/status',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const applicationId = Number(req.params.applicationId);
      if (!Number.isInteger(applicationId) || applicationId <= 0) {
        return res.status(400).json({
          error: 'Invalid application ID.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      if (!organiserRoleGateAllows(req.dbUser!)) {
        return res.status(403).json({
          error:
            'Forbidden: Participants are not permitted to review or accept applications.',
          layer: 'LAYER_2_AUTHORIZATION',
        });
      }

      const parsed = ReviewApplicationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid application status payload.',
          layer: 'LAYER_4_VALIDATION',
          issues: parsed.error.issues,
        });
      }

      const targetApp = await getApplicationById(applicationId);
      if (!targetApp) {
        return res.status(404).json({ error: 'Application not found.' });
      }

      const allowed = await isUserOrganiserForEvent(
        req.dbUser!.id,
        targetApp.eventId
      );
      if (!allowed) {
        return res.status(403).json({
          error:
            'Forbidden: You do not hold organiser authority for this application’s event.',
          layer: 'LAYER_3_RESOURCE_ISOLATION',
        });
      }

      const result = await reviewApplicationByOrganiser({
        applicationId,
        status: parsed.data.status,
        reviewerUserId: req.dbUser!.id,
        reviewerEmail: req.dbUser!.email,
      });

      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({
        error: 'Failed to update application status.',
      });
    }
  }
);

app.patch(
  '/api/organiser/credentials/:credentialId/status',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const credentialId = Number(req.params.credentialId);
      if (!Number.isInteger(credentialId) || credentialId <= 0) {
        return res.status(400).json({
          error: 'Invalid credential ID.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      if (!organiserRoleGateAllows(req.dbUser!)) {
        return res.status(403).json({
          error: 'Forbidden: Organiser authorization required.',
          layer: 'LAYER_2_AUTHORIZATION',
        });
      }

      const targetCred = await updateCredentialById(credentialId);
      if (!targetCred) {
        return res.status(404).json({ error: 'Credential not found.' });
      }

      const allowed = await isUserOrganiserForEvent(
        req.dbUser!.id,
        targetCred.eventId
      );
      if (!allowed) {
        return res.status(403).json({
          error:
            'Forbidden: You do not hold organiser authority for this credential’s event.',
          layer: 'LAYER_3_RESOURCE_ISOLATION',
        });
      }

      const parsed = UpdateCredentialStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid credential status.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      const updated = await updateCredentialStatusByOrganiser({
        credentialId,
        status: parsed.data.status,
        actorUserId: req.dbUser!.id,
        actorEmail: req.dbUser!.email,
      });

      return res.json({ credential: updated });
    } catch (error: any) {
      return sendFailure(res, error, 'Failed to update credential.');
    }
  }
);

app.put(
  '/api/organiser/events/:eventId/sessions/:sessionId',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const eventId = Number(req.params.eventId);
      const sessionId = Number(req.params.sessionId);
      if (
        !Number.isInteger(eventId) ||
        eventId <= 0 ||
        !Number.isInteger(sessionId) ||
        sessionId <= 0
      ) {
        return res.status(400).json({
          error: 'Invalid event or session ID.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      if (!organiserRoleGateAllows(req.dbUser!)) {
        return res.status(403).json({
          error: 'Forbidden: Participant role cannot modify event schedule.',
          layer: 'LAYER_2_AUTHORIZATION',
        });
      }

      const allowed = await isUserOrganiserForEvent(req.dbUser!.id, eventId);
      if (!allowed) {
        return res.status(403).json({
          error:
            'Forbidden: Cross-event isolation check failed. You are not an organiser for this event.',
          layer: 'LAYER_3_RESOURCE_ISOLATION',
        });
      }

      const parsed = SessionMutationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid session payload.',
          layer: 'LAYER_4_VALIDATION',
          issues: parsed.error.issues,
        });
      }

      const updated = await updateSessionByOrganiser({
        sessionId,
        eventId,
        title: parsed.data.title,
        description: parsed.data.description,
        speaker: parsed.data.speaker,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        venueId: parsed.data.venueId,
        status: parsed.data.status,
        actorUserId: req.dbUser!.id,
        actorEmail: req.dbUser!.email,
      });

      return res.json({ session: updated });
    } catch (error: any) {
      return sendFailure(res, error, 'Failed to update session.');
    }
  }
);

app.post(
  '/api/organiser/events/:eventId/sessions',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const eventId = Number(req.params.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        return res.status(400).json({
          error: 'Invalid event ID.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      if (!organiserRoleGateAllows(req.dbUser!)) {
        return res.status(403).json({
          error: 'Forbidden: Organiser role required.',
          layer: 'LAYER_2_AUTHORIZATION',
        });
      }

      const allowed = await isUserOrganiserForEvent(req.dbUser!.id, eventId);
      if (!allowed) {
        return res.status(403).json({
          error: 'Forbidden: Not an authorised organiser for this event.',
          layer: 'LAYER_3_RESOURCE_ISOLATION',
        });
      }

      const parsed = SessionMutationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Session validation failed.',
          layer: 'LAYER_4_VALIDATION',
          issues: parsed.error.issues,
        });
      }

      const created = await createSessionByOrganiser({
        eventId,
        title: parsed.data.title,
        description: parsed.data.description,
        speaker: parsed.data.speaker,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        dayLabel: parsed.data.dayLabel,
        track: parsed.data.track,
        venueId: parsed.data.venueId,
        status: parsed.data.status,
        actorUserId: req.dbUser!.id,
        actorEmail: req.dbUser!.email,
      });

      return res.status(201).json({ session: created });
    } catch (error: any) {
      return sendFailure(res, error, 'Failed to create session.');
    }
  }
);

app.post(
  '/api/organiser/events/:eventId/announcements',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const eventId = Number(req.params.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        return res.status(400).json({
          error: 'Invalid event ID.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      const parsed = AnnouncementCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error:
            'Rejected by Zod input validation: Malformed announcement payload.',
          layer: 'LAYER_4_VALIDATION',
          issues: parsed.error.issues,
        });
      }

      if (!organiserRoleGateAllows(req.dbUser!)) {
        return res.status(403).json({
          error: 'Forbidden: Organiser role required to publish announcements.',
          layer: 'LAYER_2_AUTHORIZATION',
        });
      }

      const allowed = await isUserOrganiserForEvent(req.dbUser!.id, eventId);
      if (!allowed) {
        return res.status(403).json({
          error: 'Forbidden: Not an authorised organiser for this event.',
          layer: 'LAYER_3_RESOURCE_ISOLATION',
        });
      }

      const created = await createAnnouncementByOrganiser({
        eventId,
        title: parsed.data.title,
        body: parsed.data.body,
        announcementType: parsed.data.announcementType,
        attachedVenueId: parsed.data.attachedVenueId,
        attachedSessionId: parsed.data.attachedSessionId,
        audience: parsed.data.audience,
        priority: parsed.data.priority,
        actorUserId: req.dbUser!.id,
        actorEmail: req.dbUser!.email,
      });

      return res.status(201).json({ announcement: created });
    } catch (error: any) {
      return sendFailure(res, error, 'Failed to publish announcement.');
    }
  }
);

app.post(
  '/api/organiser/events/:eventId/venues',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const eventId = Number(req.params.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        return res.status(400).json({
          error: 'Invalid event ID.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      if (!organiserRoleGateAllows(req.dbUser!)) {
        return res.status(403).json({
          error: 'Forbidden: Organiser role required.',
          layer: 'LAYER_2_AUTHORIZATION',
        });
      }

      const allowed = await isUserOrganiserForEvent(req.dbUser!.id, eventId);
      if (!allowed) {
        return res.status(403).json({
          error: 'Forbidden: Not an authorised organiser for this event.',
          layer: 'LAYER_3_RESOURCE_ISOLATION',
        });
      }

      const parsed = VenueCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Venue validation failed.',
          layer: 'LAYER_4_VALIDATION',
          issues: parsed.error.issues,
        });
      }

      const created = await createVenueByOrganiser({
        eventId,
        ...parsed.data,
        actorUserId: req.dbUser!.id,
        actorEmail: req.dbUser!.email,
      });

      return res.status(201).json({ venue: created });
    } catch (error: any) {
      return sendFailure(res, error, 'Failed to create venue.');
    }
  }
);

app.put(
  '/api/organiser/events/:eventId/venues/:venueId',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const eventId = Number(req.params.eventId);
      const venueId = Number(req.params.venueId);
      if (
        !Number.isInteger(eventId) ||
        eventId <= 0 ||
        !Number.isInteger(venueId) ||
        venueId <= 0
      ) {
        return res.status(400).json({
          error: 'Invalid event or venue ID.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      if (!organiserRoleGateAllows(req.dbUser!)) {
        return res.status(403).json({
          error: 'Forbidden: Organiser role required.',
          layer: 'LAYER_2_AUTHORIZATION',
        });
      }

      const allowed = await isUserOrganiserForEvent(req.dbUser!.id, eventId);
      if (!allowed) {
        return res.status(403).json({
          error: 'Forbidden: Not an authorised organiser for this event.',
          layer: 'LAYER_3_RESOURCE_ISOLATION',
        });
      }

      const parsed = VenueUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Venue update validation failed.',
          layer: 'LAYER_4_VALIDATION',
          issues: parsed.error.issues,
        });
      }

      const updated = await updateVenueByOrganiser({
        venueId,
        eventId,
        ...parsed.data,
        actorUserId: req.dbUser!.id,
        actorEmail: req.dbUser!.email,
      });

      return res.json({ venue: updated });
    } catch (error: any) {
      return sendFailure(res, error, 'Failed to update venue.');
    }
  }
);

app.patch(
  '/api/organiser/events/:eventId/config',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const eventId = Number(req.params.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        return res.status(400).json({
          error: 'Invalid event ID.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      if (!organiserRoleGateAllows(req.dbUser!)) {
        return res.status(403).json({
          error: 'Forbidden: Organiser role required.',
          layer: 'LAYER_2_AUTHORIZATION',
        });
      }

      const allowed = await isUserOrganiserForEvent(req.dbUser!.id, eventId);
      if (!allowed) {
        return res.status(403).json({
          error: 'Forbidden: Not an authorised organiser for this event.',
          layer: 'LAYER_3_RESOURCE_ISOLATION',
        });
      }

      const parsed = UpdateEventConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Event configuration validation failed.',
          layer: 'LAYER_4_VALIDATION',
          issues: parsed.error.issues,
        });
      }

      const updated = await updateEventConfigByOrganiser({
        eventId,
        ...parsed.data,
        actorUserId: req.dbUser!.id,
        actorEmail: req.dbUser!.email,
      });

      return res.json({ event: updated });
    } catch (error: any) {
      return sendFailure(res, error, 'Failed to update event config.');
    }
  }
);

app.post(
  '/api/organiser/events/:eventId/floors',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const eventId = Number(req.params.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        return res.status(400).json({
          error: 'Invalid event ID.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      if (!organiserRoleGateAllows(req.dbUser!)) {
        return res.status(403).json({
          error: 'Forbidden: Organiser role required.',
          layer: 'LAYER_2_AUTHORIZATION',
        });
      }

      const allowed = await isUserOrganiserForEvent(req.dbUser!.id, eventId);
      if (!allowed) {
        return res.status(403).json({
          error: 'Forbidden: Not an authorised organiser for this event.',
          layer: 'LAYER_3_RESOURCE_ISOLATION',
        });
      }

      const parsed = FloorCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Floor validation failed.',
          layer: 'LAYER_4_VALIDATION',
          issues: parsed.error.issues,
        });
      }

      const created = await createFloorByOrganiser({
        eventId,
        ...parsed.data,
        actorUserId: req.dbUser!.id,
        actorEmail: req.dbUser!.email,
      });

      return res.status(201).json({ floor: created });
    } catch (error: any) {
      return sendFailure(res, error, 'Failed to create floor.');
    }
  }
);

app.put(
  '/api/organiser/events/:eventId/floors/:floorId/path',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const eventId = Number(req.params.eventId);
      const floorId = Number(req.params.floorId);
      if (
        !Number.isInteger(eventId) ||
        eventId <= 0 ||
        !Number.isInteger(floorId) ||
        floorId <= 0
      ) {
        return res.status(400).json({
          error: 'Invalid event or floor ID.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      if (!organiserRoleGateAllows(req.dbUser!)) {
        return res.status(403).json({
          error: 'Forbidden: Organiser role required.',
          layer: 'LAYER_2_AUTHORIZATION',
        });
      }

      const allowed = await isUserOrganiserForEvent(req.dbUser!.id, eventId);
      if (!allowed) {
        return res.status(403).json({
          error: 'Forbidden: Not an authorised organiser for this event.',
          layer: 'LAYER_3_RESOURCE_ISOLATION',
        });
      }

      const parsed = FloorPathUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Floor path validation failed.',
          layer: 'LAYER_4_VALIDATION',
          issues: parsed.error.issues,
        });
      }

      const updated = await updateFloorPathByOrganiser({
        floorId,
        eventId,
        ...parsed.data,
        actorUserId: req.dbUser!.id,
        actorEmail: req.dbUser!.email,
      });

      return res.json({ floor: updated });
    } catch (error: any) {
      return sendFailure(res, error, 'Failed to save floor path.');
    }
  }
);

app.post(
  '/api/organiser/events/:eventId/edges',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const eventId = Number(req.params.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        return res.status(400).json({
          error: 'Invalid event ID.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      if (!organiserRoleGateAllows(req.dbUser!)) {
        return res.status(403).json({
          error: 'Forbidden: Organiser role required.',
          layer: 'LAYER_2_AUTHORIZATION',
        });
      }

      const allowed = await isUserOrganiserForEvent(req.dbUser!.id, eventId);
      if (!allowed) {
        return res.status(403).json({
          error: 'Forbidden: Not an authorised organiser for this event.',
          layer: 'LAYER_3_RESOURCE_ISOLATION',
        });
      }

      const parsed = VenueEdgeCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Edge validation failed.',
          layer: 'LAYER_4_VALIDATION',
          issues: parsed.error.issues,
        });
      }

      const created = await createVenueEdgeByOrganiser({
        eventId,
        ...parsed.data,
        actorUserId: req.dbUser!.id,
        actorEmail: req.dbUser!.email,
      });

      return res.status(201).json({ edge: created });
    } catch (error: any) {
      return sendFailure(res, error, 'Failed to create venue edge.');
    }
  }
);

app.delete(
  '/api/organiser/events/:eventId/edges/:edgeId',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const eventId = Number(req.params.eventId);
      const edgeId = Number(req.params.edgeId);
      if (
        !Number.isInteger(eventId) ||
        eventId <= 0 ||
        !Number.isInteger(edgeId) ||
        edgeId <= 0
      ) {
        return res.status(400).json({
          error: 'Invalid event or edge ID.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      if (!organiserRoleGateAllows(req.dbUser!)) {
        return res.status(403).json({
          error: 'Forbidden: Organiser role required.',
          layer: 'LAYER_2_AUTHORIZATION',
        });
      }

      const allowed = await isUserOrganiserForEvent(req.dbUser!.id, eventId);
      if (!allowed) {
        return res.status(403).json({
          error: 'Forbidden: Not an authorised organiser for this event.',
          layer: 'LAYER_3_RESOURCE_ISOLATION',
        });
      }

      await deleteVenueEdgeByOrganiser({
        edgeId,
        eventId,
        actorUserId: req.dbUser!.id,
        actorEmail: req.dbUser!.email,
      });

      return res.json({ ok: true });
    } catch (error: any) {
      return sendFailure(res, error, 'Failed to delete venue edge.');
    }
  }
);

app.post(
  '/api/organiser/events/:eventId/resources',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const eventId = Number(req.params.eventId);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        return res.status(400).json({
          error: 'Invalid event ID.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      if (!organiserRoleGateAllows(req.dbUser!)) {
        return res.status(403).json({
          error: 'Forbidden: Organiser role required.',
          layer: 'LAYER_2_AUTHORIZATION',
        });
      }

      const allowed = await isUserOrganiserForEvent(req.dbUser!.id, eventId);
      if (!allowed) {
        return res.status(403).json({
          error: 'Forbidden: Not an authorised organiser for this event.',
          layer: 'LAYER_3_RESOURCE_ISOLATION',
        });
      }

      const parsed = ResourceCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Resource validation failed.',
          layer: 'LAYER_4_VALIDATION',
          issues: parsed.error.issues,
        });
      }

      const created = await createResourceByOrganiser({
        eventId,
        ...parsed.data,
        actorUserId: req.dbUser!.id,
        actorEmail: req.dbUser!.email,
      });

      return res.status(201).json({ resource: created });
    } catch (error: any) {
      return sendFailure(res, error, 'Failed to create resource.');
    }
  }
);

// ============================================================================
// PUBLIC QR CREDENTIAL VERIFICATION (LAYER 6 — DATA MINIMISATION)
// ============================================================================

app.get('/api/verify/:token', async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token || token.length < 8) {
      return res.status(400).json({
        valid: false,
        status: 'CREDENTIAL NOT VALID',
        error: 'Credential not valid.',
      });
    }

    const result = await verifyPublicCredentialByToken(token);
    if (!result) {
      return res.status(404).json({
        valid: false,
        status: 'CREDENTIAL NOT VALID',
        error: 'Credential not valid.',
      });
    }

    return res.json(result);
  } catch {
    return res.status(500).json({
      valid: false,
      status: 'CREDENTIAL NOT VALID',
      error: 'Credential not valid.',
    });
  }
});

// ============================================================================
// QR WAYPOINT SCANNING (MY EVENT TRAIL)
// ============================================================================

app.post(
  '/api/waypoints/scan',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = WaypointScanSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid waypoint token.',
          layer: 'LAYER_4_VALIDATION',
          issues: parsed.error.issues,
        });
      }

      const result = await recordParticipantWaypointScan({
        userId: req.dbUser!.id,
        waypointToken: parsed.data.waypointToken,
      });

      return res.status(201).json(result);
    } catch (error: any) {
      return res
        .status(403)
        .json({ error: 'Waypoint scan rejected.' });
    }
  }
);

// Deliberate "I am here" check-in: the server resolves the venue's token, so
// QR secrets are never shipped to participant browsers. Same acceptance rules.
app.post(
  '/api/events/:eventId/venues/:venueId/checkin',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const eventId = Number(req.params.eventId);
      const venueId = Number(req.params.venueId);
      if (
        !Number.isInteger(eventId) ||
        eventId <= 0 ||
        !Number.isInteger(venueId) ||
        venueId <= 0
      ) {
        return res.status(400).json({
          error: 'Invalid event or place.',
          layer: 'LAYER_4_VALIDATION',
        });
      }
      const token = await getWaypointTokenForVenue(eventId, venueId);
      if (!token) {
        return res.status(404).json({ error: 'Place not found.' });
      }
      const result = await recordParticipantWaypointScan({
        userId: req.dbUser!.id,
        waypointToken: token,
      });
      return res.status(201).json(result);
    } catch (error: any) {
      return res
        .status(403)
        .json({ error: 'Check-in rejected.' });
    }
  }
);

// ============================================================================
// ASK AUVRESENCE & BRIEF ME (LAYER 5 — AI CONTEXT BOUNDARY)
// ============================================================================

async function buildTrustedParticipantAIContext(
  userId: number,
  userDisplayName: string,
  eventId: number
): Promise<AuthorisedParticipantAIContext> {
  const fullContext = await getEventFullContext(eventId, userId);
  if (!fullContext) {
    throw new Error('Event not found.');
  }

  return {
    participantName:
      'Participant',
    participantRole:
      fullContext.myApplication?.category || 'Prospective Applicant',
    applicationStatus: fullContext.myApplication?.status || 'NOT_APPLIED',
    credentialCode: null,
    credentialStatus: fullContext.myCredential?.status || null,
    eventTitle: fullContext.event.title,
    eventDates: fullContext.event.datesLabel,
    eventLocation: fullContext.event.location,
    happeningNow: fullContext.pulse.happeningNow
      ? {
          title: fullContext.pulse.happeningNow.title,
          startTime: fullContext.pulse.happeningNow.startTime,
          endTime: fullContext.pulse.happeningNow.endTime,
          venueName: fullContext.pulse.happeningNow.venueName,
          venueFloor: fullContext.pulse.happeningNow.venueFloor,
          venueZone: fullContext.pulse.happeningNow.venueZone,
          lastUpdatedNote: fullContext.pulse.happeningNow.lastUpdatedNote,
        }
      : null,
    upNext: fullContext.pulse.upNext
      ? {
          title: fullContext.pulse.upNext.title,
          startTime: fullContext.pulse.upNext.startTime,
          endTime: fullContext.pulse.upNext.endTime,
          venueName: fullContext.pulse.upNext.venueName,
          venueFloor: fullContext.pulse.upNext.venueFloor,
          venueZone: fullContext.pulse.upNext.venueZone,
          lastUpdatedNote: fullContext.pulse.upNext.lastUpdatedNote,
        }
      : null,
    schedule: fullContext.sessions.map((s) => ({
      title: s.title,
      startTime: s.startTime,
      endTime: s.endTime,
      venueName: s.venueName,
      venueFloor: s.venueFloor,
      venueZone: s.venueZone,
      status: s.status,
      lastUpdatedNote: s.lastUpdatedNote,
    })),
    announcements: fullContext.announcements.map((a) => ({
      title: a.title,
      body: a.body,
      audience: a.audience,
      priority: a.priority,
    })),
    resources: fullContext.resources.map((r) => ({
      title: r.title,
      category: r.category,
      description: r.description,
    })),
    waypointTrail: fullContext.waypointTrail.map((w) => ({
      venueName: w.venueName,
      scannedAt: w.scannedAt ? new Date(w.scannedAt).toLocaleTimeString() : '',
    })),
    venueDirectory: fullContext.venues.map((v) => ({
      name: v.name,
      floor: v.floor,
      zone: v.zone,
      poiType: v.poiType,
      poiCategory: v.poiCategory,
      operationalStatus: v.operationalStatus,
      accessible: v.accessible,
    })),
    recommendedRouteToNextSession: (() => {
      const targetVenueId =
        fullContext.pulse.upNext?.venueId ||
        fullContext.pulse.happeningNow?.venueId;
      if (!targetVenueId || fullContext.venues.length === 0) return null;
      const lastScannedVenueId =
        fullContext.waypointTrail.length > 0
          ? fullContext.waypointTrail[fullContext.waypointTrail.length - 1]
              .venueId
          : null;
      // No scanned waypoint means no verified starting point: never assume one.
      if (!lastScannedVenueId) return null;
      const stdRoute = computeVenueRoute({
        venues: fullContext.venues,
        edges: fullContext.edges,
        fromVenueId: lastScannedVenueId,
        toVenueId: targetVenueId,
        accessibleOnly: false,
      });
      const accRoute = computeVenueRoute({
        venues: fullContext.venues,
        edges: fullContext.edges,
        fromVenueId: lastScannedVenueId,
        toVenueId: targetVenueId,
        accessibleOnly: true,
      });
      const fromV = fullContext.venues.find((v) => v.id === lastScannedVenueId);
      const toV = fullContext.venues.find((v) => v.id === targetVenueId);
      return {
        fromLocation: fromV ? `${fromV.name} (${fromV.floor})` : 'Arrival',
        toLocation: toV ? `${toV.name} (${toV.floor})` : 'Destination',
        standardRouteSummary: stdRoute.summary,
        stepFreeRouteSummary: accRoute.summary,
      };
    })(),
  };
}

app.post('/api/ai/ask', async (req: AuthRequest, res: Response) => {
  const parsed = AskAISchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: 'VALIDATION_ERROR', error: 'Use a question of 2–500 characters and up to six conversation messages.' });
  const { question, eventId, history = [] } = parsed.data;
  const q = question.toLowerCase().replace(/[’]/g, "'");
  const actions: PlatformAction[] = [];
  const direct = (answer: string) => res.json({ answer, actions, provider: 'event-state', model: 'deterministic', contextTimestamp: new Date().toISOString() });
  try {
    let snapshot: unknown;
    if (eventId) {
      const full = await getEventFullContext(eventId, req.dbUser?.id);
      if (!full) return res.status(404).json({ error: 'Event not found.' });
      if (/application|attention|pending/.test(q) && full.isOrganiser) {
        const dashboard = await getOrganiserDashboardData(eventId);
        actions.push({ type: 'OPEN_STUDIO', label: 'Review applications', eventId });
        return direct(`${dashboard.stats.underReview} application(s) need review for ${full.event.title}. No decisions have been made by Auvresence.`);
      }
      // Guest/public facts never acquire participant-only context.
      if (!req.dbUser) {
        snapshot = { event: { title: full.event.title, description: full.event.description, dates: full.event.datesLabel, location: full.event.location }, schedule: full.sessions.map(s => ({ title: s.title, startTime: s.startTime, endTime: s.endTime, day: s.dayLabel })) };
        if (/next|credential|where do i|changed/.test(q)) return direct('Sign in to see your own journey and authorised event updates.');
      } else {
        const trusted = await buildTrustedParticipantAIContext(req.dbUser.id, 'Participant', eventId);
        if (/brief (my )?day|brief me/.test(q)) return direct(buildDeterministicFallbackBriefing(trusted).briefing);
        const answer = answerEventQuestion(question, trusted);
        if (answer !== null) {
          if (/credential/.test(q)) actions.push({ type: 'OPEN_CREDENTIAL', label: 'My credential', eventId });
          else if (/where|venue|go|room/.test(q)) actions.push({ type: 'OPEN_VENUE', label: 'View venue', eventId });
          else actions.push({ type: 'OPEN_JOURNEY', label: 'Open journey', eventId });
          return direct(answer);
        }
        // Minimise identity before any external provider request.
        snapshot = { ...trusted, participantName: 'Participant', credentialCode: null, waypointTrail: [] };
      }
    } else {
      const published = (await getPublishedEvents()).filter(e => e.visibility === 'PUBLIC' && ['PUBLISHED', 'LIVE'].includes(e.status) && (isShowcaseModeEnabled() || !e.isDemoSeed));
      const visible = published.slice(0, 10).map(e => ({ id: e.id, title: e.title, description: e.description.slice(0, 800), location: e.location, dates: e.datesLabel, applicationStatus: e.applicationStatus }));
      const journeys = req.dbUser ? await getUserJourneys(req.dbUser.id) : null;
      snapshot = { publicEvents: visible, ownJourneys: journeys ? { participating: journeys.participating.map(j => ({ eventId: j.event.id, title: j.event.title, applicationStatus: j.application.status })), organising: journeys.organising.map(e => ({ eventId: e.id, title: e.title })) } : null };
      if (/what is auvresence|what can you do|who are you/.test(q)) {
        actions.push({ type: 'EXPLORE_EVENTS', label: 'Explore events' });
        return direct('Auvresence brings event discovery, applications, participant journeys, schedules, venue routes and credentials into one place. Organisers manage their event through Studio.');
      }
      if (/organis|organiz|create (an )?event|host (an )?event/.test(q)) {
        actions.push({ type: 'CREATE_EVENT', label: req.dbUser ? 'Start creating event' : 'Sign in to start' });
        return direct('Start with your event identity, dates and location. The creation form saves your event and grants you Studio access after a successful server response.');
      }
      if (/explore|discover|what events|can i join|find (an )?event/.test(q)) {
        actions.push({ type: 'EXPLORE_EVENTS', label: 'Explore events' });
        return direct(visible.length ? `Public events: ${visible.map(e => `${e.title} (${e.applicationStatus === 'OPEN' ? 'applications open' : 'applications ' + e.applicationStatus.toLowerCase()})`).join('; ')}.` : 'No public events are available right now.');
      }
      if (/my journey|my event|what's next|where do i|my application|my credential/.test(q)) {
        if (!journeys) return direct('Sign in to see your own event journeys.');
        for (const j of journeys.participating.slice(0, 3)) actions.push({ type: 'OPEN_JOURNEY', label: j.event.title, eventId: j.event.id });
        for (const e of journeys.organising.slice(0, 3)) actions.push({ type: 'OPEN_STUDIO', label: e.title, eventId: e.id });
        return direct(actions.length ? 'Open your event to see its current schedule, application status and venue information.' : 'You do not have any event journeys yet. Explore events or organise one.');
      }
      if (/applications.*attention|pending applications/.test(q)) {
        if (!journeys?.organising.length) return direct('No organising events are available for this identity.');
        const counts = await Promise.all(journeys.organising.map(async e => ({ event: e, pending: (await getOrganiserDashboardData(e.id)).stats.underReview })));
        for (const row of counts.slice(0, 5)) actions.push({ type: 'OPEN_STUDIO', label: row.event.title, eventId: row.event.id });
        return direct(counts.map(row => `${row.event.title}: ${row.pending} awaiting review`).join('; ') + '.');
      }
    }
    try {
      const result = await generatePlatformResponse({ systemInstruction: AUVRESENCE_INSTRUCTIONS, prompt: conversationPrompt(question, snapshot, history), maxTokens: 350 });
      return res.json({ answer: result.text, actions, provider: result.provider, model: result.model, contextTimestamp: new Date().toISOString() });
    } catch (error) {
      console.error('Auvresence provider unavailable:', error instanceof Error ? error.name : 'UnknownError');
      return res.status(503).json({ code: error instanceof AiNotConfiguredError ? 'AI_NOT_CONFIGURED' : 'AI_UNAVAILABLE', error: 'Auvresence intelligence is temporarily unavailable. Your event information and tools are still accessible.' });
    }
  } catch (error) {
    if (error instanceof EventAccessDeniedError) return res.status(404).json({ error: 'Event not found.' });
    console.error('Auvresence context failed:', error);
    const failure = databaseFailure(error);
    return res.status(failure?.status || 500).json(failure || { error: 'Could not load authorised event information.' });
  }
});

app.post(
  '/api/ai/voice-ask',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = VoiceAskSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid voice payload.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      let transcript = '';
      try {
        const sttRes = await transcribeParticipantSpeech({
          audioBase64: parsed.data.audioBase64,
          mimeType: parsed.data.mimeType,
        });
        transcript = sttRes.text;
      } catch (sttErr: any) {
        const code =
          sttErr instanceof VoiceNotConfiguredError
            ? 'VOICE_NOT_CONFIGURED'
            : 'VOICE_UNAVAILABLE';
        return res.status(503).json({
          code,
          error: 'Voice is unavailable. Continue by typing.',
        });
      }

      const trustedContext = await buildTrustedParticipantAIContext(
        req.dbUser!.id,
        req.dbUser!.displayName,
        parsed.data.eventId
      );

      let answerText = '';
      try {
        const aiResult = await generateAskAuvresenceResponse(
          transcript,
          trustedContext
        );
        answerText = aiResult.answer;
      } catch {
        // If voice STT succeeded but text AI failed, provide deterministic server-state answer so voice flow never destroys Ask Auvresence
        answerText = trustedContext.upNext
          ? `Your next session is ${trustedContext.upNext.title} at ${trustedContext.upNext.startTime} in ${trustedContext.upNext.venueName} (${trustedContext.upNext.venueFloor} · ${trustedContext.upNext.venueZone}).`
          : `You are registered for ${trustedContext.eventTitle}. Please check Event Pulse for your current schedule.`;
      }

      let audioBase64: string | null = null;
      let audioMimeType: string | null = null;
      try {
        const ttsRes = await synthesiseAuvresenceSpeech({ text: answerText });
        audioBase64 = ttsRes.audioBase64;
        audioMimeType = ttsRes.mimeType;
      } catch {
        // TTS failure retains and displays text answer normally
      }

      return res.json({
        question: transcript,
        answer: answerText,
        audioBase64,
        audioMimeType,
        contextTimestamp: new Date().toISOString(),
        authorisedContextSummary: {
          participant: trustedContext.participantName,
          applicationStatus: trustedContext.applicationStatus,
          upNextSession: trustedContext.upNext?.title || null,
          upNextVenue: trustedContext.upNext?.venueName || null,
          upNextNote: trustedContext.upNext?.lastUpdatedNote || null,
        },
      });
    } catch {
      return res.status(503).json({
        code: 'VOICE_UNAVAILABLE',
        error: 'Voice is unavailable. Continue by typing.',
      });
    }
  }
);

app.post(
  '/api/ai/tts',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = TtsSpeakSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid text payload for speech synthesis.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      try {
        const ttsRes = await synthesiseAuvresenceSpeech({
          text: parsed.data.text,
        });
        return res.json(ttsRes);
      } catch (err: any) {
        const code =
          err instanceof VoiceNotConfiguredError
            ? 'VOICE_NOT_CONFIGURED'
            : 'VOICE_UNAVAILABLE';
        return res.status(503).json({
          code,
          error: 'Voice is unavailable. Continue by typing.',
        });
      }
    } catch {
      return res.status(503).json({
        code: 'VOICE_UNAVAILABLE',
        error: 'Voice is unavailable. Continue by typing.',
      });
    }
  }
);

app.post(
  '/api/ai/vision',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = VisionAnalyseSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid image payload for vision analysis.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      const trustedContext = await buildTrustedParticipantAIContext(
        req.dbUser!.id,
        req.dbUser!.displayName,
        parsed.data.eventId
      );

      try {
        const visionResult = await analyseParticipantEventImage({
          imageDataUrl: parsed.data.imageDataUrl,
          question:
            parsed.data.question ||
            'Summarise this event notice and how it relates to my schedule.',
          context: trustedContext,
        });

        return res.json({
          answer: visionResult.answer,
          contextTimestamp: new Date().toISOString(),
          authorisedContextSummary: {
            participant: trustedContext.participantName,
            applicationStatus: trustedContext.applicationStatus,
            upNextSession: trustedContext.upNext?.title || null,
            upNextVenue: trustedContext.upNext?.venueName || null,
            upNextNote: trustedContext.upNext?.lastUpdatedNote || null,
          },
        });
      } catch (visErr: any) {
        const code =
          visErr instanceof VisionNotConfiguredError
            ? 'VISION_NOT_CONFIGURED'
            : 'VISION_UNAVAILABLE';
        return res.status(503).json({
          code,
          error: 'Image understanding is currently unavailable.',
        });
      }
    } catch {
      return res.status(503).json({
        code: 'VISION_UNAVAILABLE',
        error: 'Image understanding is currently unavailable.',
      });
    }
  }
);

app.post(
  '/api/ai/brief-me',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = BriefMeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid event ID for briefing.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      const trustedContext = await buildTrustedParticipantAIContext(
        req.dbUser!.id,
        req.dbUser!.displayName,
        parsed.data.eventId
      );

      try {
        const briefingResult = await generateParticipantBriefing(trustedContext);
        return res.json({
          ...briefingResult,
          stats: {
            scheduledActivities: trustedContext.schedule.length,
            nextSessionTitle: trustedContext.upNext?.title || null,
            nextSessionTime: trustedContext.upNext?.startTime || null,
            nextDestination: trustedContext.upNext?.venueName || null,
            updatesCount: trustedContext.announcements.length,
          },
        });
      } catch {
        // Phase 7: Deterministic non-AI fallback briefing from server state when AI is unavailable
        const fallback = buildDeterministicFallbackBriefing(trustedContext);
        return res.status(200).json({
          ...fallback,
          stats: {
            scheduledActivities: trustedContext.schedule.length,
            nextSessionTitle: trustedContext.upNext?.title || null,
            nextSessionTime: trustedContext.upNext?.startTime || null,
            nextDestination: trustedContext.upNext?.venueName || null,
            updatesCount: trustedContext.announcements.length,
          },
        });
      }
    } catch (error: any) {
      return sendFailure(res, error, 'Failed to generate briefing.');
    }
  }
);

// ============================================================================
// SECURITY INSPECTOR TARGETS & DEMO RESET ROUTES (LOCKED BY SHOWCASE_MODE)
// ============================================================================

app.get(
  '/api/security/inspector-targets',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!isShowcaseModeEnabled()) {
        return res.status(403).json({
          error: 'Security Inspector fixture lookup requires SHOWCASE_MODE=true.',
        });
      }

      await ensureShowcaseDataSeeded();
      const allEvents = await getPublishedEvents();
      const primaryEvent =
        allEvents.find((e) => e.slug === 'auvreo-youth-summit-2026') ||
        allEvents[0];
      const isolatedEventId = await getIsolationFixtureEventId();

      const peerAppId = await getPeerApplicationIdForIsolationTest(
        req.dbUser!.id
      );

      const dashboard = primaryEvent
        ? await getOrganiserDashboardData(primaryEvent.id)
        : null;
      const sampleCred = dashboard?.applications.find(
        (a) => a.credential?.status === 'ACTIVE'
      )?.credential;

      return res.json({
        primaryEventId: primaryEvent?.id || 1,
        isolatedEventId,
        peerApplicationId: peerAppId || 1,
        sampleVerificationToken:
          sampleCred?.verificationToken || 'invalid_token',
      });
    } catch (error: any) {
      return res.status(500).json({
        error: 'Failed to prepare security inspector targets.',
      });
    }
  }
);

app.post(
  '/api/demo/reset',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      // Phase 1.2 Lockdown: Require SHOWCASE_MODE=true + showcase_hmac session + recognised demo UID
      if (!isShowcaseModeEnabled()) {
        return res.status(403).json({
          error: 'Demo reset is disabled when SHOWCASE_MODE=false.',
          code: 'SHOWCASE_MODE_DISABLED',
        });
      }

      if (
        req.user?.authSource !== 'showcase_hmac' ||
        !RECOGNISED_DEMO_UIDS.has(req.user.uid) ||
        !req.dbUser?.isDemoSeed
      ) {
        return res.status(403).json({
          error:
            'Forbidden: Only recognised showcase demo sessions may reset showcase fixture records.',
          layer: 'LAYER_2_AUTHORIZATION',
        });
      }

      const parsed = ResetDemoSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid reset mode.',
          layer: 'LAYER_4_VALIDATION',
        });
      }

      const result = await resetGoldenPathDemoState({
        mode: parsed.data.mode,
      });

      return res.json(result);
    } catch (error: any) {
      return sendFailure(res, error, 'Failed to reset demo state.');
    }
  }
);

// ============================================================================
// VITE DEV SERVER / STATIC ASSET SERVING
// ============================================================================

// API misses must not fall through to the frontend's SPA document.
app.use('/api', (_req, res) => {
  res.status(404).json({ code: 'NOT_FOUND', error: 'API route not found.' });
});

app.use((error: any, _req: Request, res: Response, _next: express.NextFunction) => {
  if (error?.type === 'entity.too.large') return res.status(413).json({ code: 'VALIDATION_ERROR', error: 'Request is too large.' });
  if (error instanceof SyntaxError) return res.status(400).json({ code: 'VALIDATION_ERROR', error: 'Request body must be valid JSON.' });
  console.error('Unhandled request error:', error);
  return res.status(500).json({ code: 'REQUEST_FAILED', error: 'The request could not be completed.' });
});

async function startServer() {
  const PORT = Number(process.env.PORT || 3000);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Auvresence server running on http://0.0.0.0:${PORT}`);
  });
}

// Vercel invokes the exported handler; local development/production retain
// their existing standalone server and Vite/static middleware.
export default app;
if (process.env.VERCEL !== '1') startServer();
