import crypto from 'crypto';
import { ProfileStorageError } from './errors.ts';
import { and, asc, desc, eq, inArray, ne, sql, getTableColumns, getTableName } from 'drizzle-orm';
import { db } from './index.ts';
import {
  announcements,
  applications,
  auditLogs,
  credentials,
  eventOrganisers,
  events,
  organisations,
  resources,
  sessions,
  users,
  venueEdges,
  venueFloors,
  venues,
  waypointScans,
} from './schema.ts';

function generateOpaqueToken(bytes = 20): string {
  return crypto.randomBytes(bytes).toString('hex');
}

function generateParticipantCode(idSeed: number): string {
  const rand = crypto.randomInt(1000, 9999);
  return `AUV-2026-${String(idSeed).padStart(2, '0')}${rand}`;
}

export class EventAccessDeniedError extends Error {
  constructor() {
    super('Event not available.');
    this.name = 'EventAccessDeniedError';
  }
}

export async function inspectDatabaseHealth() {
  try {
    const result = await db.execute(sql`select table_name, column_name from information_schema.columns where table_schema = current_schema()`);
    const present = new Set(result.rows.map((row: any) => `${row.table_name}.${row.column_name}`));
    const requiredTables = [users, organisations, events, eventOrganisers, applications, credentials, announcements, resources, sessions, venues, venueFloors, venueEdges, waypointScans, auditLogs];
    const missing = requiredTables.flatMap(table => Object.values(getTableColumns(table)).map(column => `${getTableName(table)}.${column.name}`)).filter(column => !present.has(column));
    return { connected: true, schemaReady: missing.length === 0 };
  } catch (error) {
    console.error('Database readiness check failed:', error);
    return { connected: false, schemaReady: false };
  }
}
export async function checkDatabaseHealth(): Promise<boolean> {
  const status = await inspectDatabaseHealth();
  return status.connected && status.schemaReady;
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string,
  isDemoSeed = false
) {
  try {
    const cleanName =
      displayName ||
      email
        .split('@')[0]
        .replace(/[._-]/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());

    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: cleanName,
        institution: isDemoSeed
          ? 'Chandigarh University, Uttar Pradesh (Showcase Account)'
          : null,
        activeRole: isDemoSeed && uid.includes('organiser') ? 'ORGANISER' : 'PARTICIPANT',
        isDemoSeed,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new ProfileStorageError(error);
  }
}

export async function getUserById(userId: number) {
  try {
    const rows = await db.select().from(users).where(eq(users.id, userId));
    return rows[0] || null;
  } catch (error) {
    console.error('Database query failed in getUserById:', error);
    throw new Error('Failed to fetch user profile.', { cause: error });
  }
}

let isSeeding = false;

export async function ensureShowcaseDataSeeded() {
  if (isSeeding) return;
  try {
    const existingOrgs = await db.select().from(organisations);
    if (existingOrgs.length > 0) {
      // Ensure synthetic cross-tenant security fixture is marked ISOLATION_FIXTURE and clearly labelled as a showcase fixture
      await db
        .update(organisations)
        .set({
          name: 'Synthetic Tenant B (Security Isolation Fixture)',
          headquarters: 'Security Test Sandbox',
          isDemoSeed: true,
        })
        .where(eq(organisations.slug, 'nordic-systems-institute'));

      await db
        .update(events)
        .set({
          title: 'Isolated Tenant Event B (Security Fixture)',
          subtitle: 'Cross-Event Authorization Boundary Test Fixture',
          location: 'Sandbox Environment',
          datesLabel: 'Security Fixture',
          status: 'ISOLATION_FIXTURE',
          isDemoSeed: true,
        })
        .where(eq(events.slug, 'autonomous-infrastructure-colloquium-2026'));

      await db
        .update(users)
        .set({
          displayName: 'Showcase Organiser (Account B)',
          institution: 'Auvresence Demo Operations',
          isDemoSeed: true,
        })
        .where(eq(users.uid, 'auvresence-demo-organiser-arjun'));

      await db
        .update(users)
        .set({
          displayName: 'Demo Participant B (Isolation Fixture)',
          institution: 'Showcase Demo Record',
          isDemoSeed: true,
        })
        .where(eq(users.uid, 'auvresence-demo-participant-meera'));

      await db
        .update(users)
        .set({
          displayName: 'Demo Applicant C (Showcase Fixture)',
          institution: 'Showcase Demo Record',
          isDemoSeed: true,
        })
        .where(eq(users.uid, 'auvresence-demo-participant-rohan'));

      await db
        .update(applications)
        .set({
          applicantName: 'Demo Participant B (Showcase Fixture)',
          applicantEmail: 'participant-b.demo@auvresence.showcase',
          institution: 'Showcase Demo Record',
          isDemoSeed: true,
        })
        .where(eq(applications.applicantEmail, 'meera.nair@iitd.ac.in'));

      await db
        .update(applications)
        .set({
          applicantName: 'Demo Applicant C (Showcase Fixture)',
          applicantEmail: 'applicant-c.demo@auvresence.showcase',
          institution: 'Showcase Demo Record',
          isDemoSeed: true,
        })
        .where(eq(applications.applicantEmail, 'rohan.k@bits-pilani.ac.in'));

      // Ensure V4 venue metadata, floors, amenity/connector POIs, and edges exist on Event 1
      const [ev1] = await db
        .select()
        .from(events)
        .where(eq(events.slug, 'auvreo-youth-summit-2026'));
      if (ev1) {
        if (!ev1.venueName) {
          await db
            .update(events)
            .set({
              venueName: 'Bharat Mandapam Convention Complex',
              venueAddress: 'Pragati Maidan, New Delhi',
              venuePublished: true,
              applicationStatus: 'OPEN',
              applicationConfig: JSON.stringify({
                requirePhone: false,
                customQuestionLabel: 'Primary area of technical or policy interest',
                customQuestionRequired: false,
              }),
            })
            .where(eq(events.id, ev1.id));
        }

        const existingFloors = await db
          .select()
          .from(venueFloors)
          .where(eq(venueFloors.eventId, ev1.id));
        if (existingFloors.length === 0) {
          await db.insert(venueFloors).values([
            {
              eventId: ev1.id,
              name: 'Floor 1',
              levelOrder: 1,
              description: 'Arrival Concourse, Registration, Dining & Medical',
              recordedPathJson: JSON.stringify([
                { x: 18, y: 80 },
                { x: 45, y: 78 },
                { x: 74, y: 74 },
              ]),
              recordedDistanceMeters: 140,
              isDemoSeed: true,
            },
            {
              eventId: ev1.id,
              name: 'Floor 2',
              levelOrder: 2,
              description: 'Main Plenary Auditorium & Policy Chambers',
              recordedPathJson: JSON.stringify([
                { x: 26, y: 40 },
                { x: 48, y: 38 },
                { x: 72, y: 35 },
              ]),
              recordedDistanceMeters: 115,
              isDemoSeed: true,
            },
            {
              eventId: ev1.id,
              name: 'Floor 3',
              levelOrder: 3,
              description: 'Innovation Zone Laboratories & Technical Demos',
              recordedPathJson: JSON.stringify([
                { x: 58, y: 24 },
                { x: 70, y: 28 },
                { x: 84, y: 20 },
              ]),
              recordedDistanceMeters: 95,
              isDemoSeed: true,
            },
          ]);
        }

        const ev1Venues = await db
          .select()
          .from(venues)
          .where(eq(venues.eventId, ev1.id));

        // Update existing POIs with accurate poiType and poiCategory
        for (const v of ev1Venues) {
          const lower = v.name.toLowerCase();
          if (lower.includes('registration')) {
            await db
              .update(venues)
              .set({ poiType: 'REGISTRATION', poiCategory: 'EVENT' })
              .where(eq(venues.id, v.id));
          } else if (lower.includes('main hall')) {
            await db
              .update(venues)
              .set({ poiType: 'HALL', poiCategory: 'EVENT' })
              .where(eq(venues.id, v.id));
          } else if (lower.includes('atrium')) {
            await db
              .update(venues)
              .set({ poiType: 'REST_AREA', poiCategory: 'AMENITY' })
              .where(eq(venues.id, v.id));
          }
        }

        const hasFood = ev1Venues.some((v) => v.poiType === 'FOOD' || v.name.toLowerCase().includes('food'));
        if (!hasFood) {
          await db.insert(venues).values([
            {
              eventId: ev1.id,
              name: 'Food Court',
              shortDescription: 'Delegate dining hall, refreshments, and coffee stations.',
              floor: 'Floor 1',
              zone: 'East Pavilion',
              poiType: 'FOOD',
              poiCategory: 'AMENITY',
              operationalStatus: 'OPEN',
              accessible: true,
              mapX: 82,
              mapY: 78,
              waypointToken: 'wp_demo_food_court_2026',
              capacity: 220,
              isDemoSeed: true,
            },
            {
              eventId: ev1.id,
              name: 'Central Washrooms',
              shortDescription: 'Accessible delegate washrooms on Floor 1 concourse.',
              floor: 'Floor 1',
              zone: 'Arrival Concourse',
              poiType: 'WASHROOM',
              poiCategory: 'AMENITY',
              operationalStatus: 'OPEN',
              accessible: true,
              mapX: 35,
              mapY: 82,
              waypointToken: 'wp_demo_washroom_2026',
              capacity: 40,
              isDemoSeed: true,
            },
            {
              eventId: ev1.id,
              name: 'Medical & Help Desk',
              shortDescription: 'First-aid station, delegate support, and accessibility assistance.',
              floor: 'Floor 1',
              zone: 'Arrival Concourse',
              poiType: 'MEDICAL',
              poiCategory: 'AMENITY',
              operationalStatus: 'OPEN',
              accessible: true,
              mapX: 28,
              mapY: 68,
              waypointToken: 'wp_demo_medical_2026',
              capacity: 25,
              isDemoSeed: true,
            },
            {
              eventId: ev1.id,
              name: 'Lift A',
              shortDescription: 'Step-free passenger elevator connecting Floor 1, Floor 2, and Floor 3.',
              floor: 'Floor 1',
              zone: 'Central Core',
              poiType: 'LIFT',
              poiCategory: 'MOVEMENT',
              operationalStatus: 'OPEN',
              accessible: true,
              connectedFloorNames: JSON.stringify(['Floor 1', 'Floor 2', 'Floor 3']),
              mapX: 50,
              mapY: 54,
              waypointToken: 'wp_demo_lift_a_2026',
              capacity: 20,
              isDemoSeed: true,
            },
            {
              eventId: ev1.id,
              name: 'Stairs A',
              shortDescription: 'Central atrium staircase connecting Floor 1, Floor 2, and Floor 3.',
              floor: 'Floor 1',
              zone: 'Central Core',
              poiType: 'STAIRS',
              poiCategory: 'MOVEMENT',
              operationalStatus: 'OPEN',
              accessible: false,
              connectedFloorNames: JSON.stringify(['Floor 1', 'Floor 2', 'Floor 3']),
              mapX: 44,
              mapY: 56,
              waypointToken: 'wp_demo_stairs_a_2026',
              capacity: 60,
              isDemoSeed: true,
            },
          ]).onConflictDoNothing();
        }

        const existingEdges = await db
          .select()
          .from(venueEdges)
          .where(eq(venueEdges.eventId, ev1.id));
        if (existingEdges.length === 0) {
          const allV = await db
            .select()
            .from(venues)
            .where(eq(venues.eventId, ev1.id));
          const byName = (sub: string) =>
            allV.find((x) => x.name.toLowerCase().includes(sub.toLowerCase()));
          const reg = byName('Registration');
          const lift = byName('Lift A');
          const stairs = byName('Stairs A');
          const hall = byName('Main Hall');
          const lab301 = byName('Lab 301');
          const lab302 = byName('Lab 302');
          const lab305 = byName('Lab 305');
          const food = byName('Food Court');
          const wash = byName('Washroom');
          const med = byName('Medical');
          const atrium = byName('Atrium');

          const pairs: Array<[ typeof reg, typeof reg, number, boolean, boolean ]> = [
            [reg, lift, 30, true, false],
            [reg, stairs, 25, false, false],
            [reg, food, 45, true, false],
            [reg, wash, 20, true, false],
            [reg, med, 18, true, false],
            [reg, atrium, 35, true, false],
            [lift, hall, 25, true, true],
            [stairs, hall, 22, false, true],
            [lift, lab301, 30, true, true],
            [lift, lab302, 35, true, true],
            [lift, lab305, 40, true, true],
            [stairs, lab302, 30, false, true],
            [stairs, lab305, 35, false, true],
            [lab301, lab302, 18, true, false],
            [lab302, lab305, 20, true, false],
          ];

          for (const [a, b, dist, acc, cross] of pairs) {
            if (a && b) {
              await db.insert(venueEdges).values({
                eventId: ev1.id,
                fromVenueId: a.id,
                toVenueId: b.id,
                distanceMeters: dist,
                accessible: acc,
                isCrossFloor: cross,
                isDemoSeed: true,
              });
            }
          }
        }
      }

      return;
    }
    isSeeding = true;

    // 1. Seed Organisations
    const [auvreoOrg] = await db
      .insert(organisations)
      .values({
        slug: 'auvreo-international',
        name: 'Auvreo International',
        description:
          'Real-world youth diplomacy, policy research, and technology systems organisation testing the Auvresence event intelligence ecosystem.',
        headquarters: 'New Delhi, India',
        isDemoSeed: true,
      })
      .onConflictDoUpdate({
        target: organisations.slug,
        set: { name: 'Auvreo International' },
      })
      .returning();

    const [isolationFixtureOrg] = await db
      .insert(organisations)
      .values({
        slug: 'nordic-systems-institute',
        name: 'Synthetic Tenant B (Security Isolation Fixture)',
        description:
          'Synthetic multi-tenant fixture used strictly by the Security Inspector to verify cross-event authorization boundaries.',
        headquarters: 'Security Test Sandbox',
        isDemoSeed: true,
      })
      .onConflictDoUpdate({
        target: organisations.slug,
        set: { name: 'Synthetic Tenant B (Security Isolation Fixture)' },
      })
      .returning();

    // 2. Seed Events
    const [summitEvent] = await db
      .insert(events)
      .values({
        slug: 'auvreo-youth-summit-2026',
        organisationId: auvreoOrg.id,
        title: 'Auvreo International Youth Summit — India 2026',
        subtitle:
          'Institutional Governance, Applied AI & Connected Digital Infrastructure',
        description:
          'A two-day inter-institutional convening in New Delhi. Demonstrated on Auvresence to show how one shared event state connects organiser operations, participant experience, venue awareness, and contextual intelligence.',
        location: 'New Delhi, India',
        datesLabel: '25–26 December 2026',
        startDate: '2026-12-25',
        endDate: '2026-12-26',
        status: 'LIVE',
        categories: JSON.stringify([
          'Delegate — AI & Systems Policy',
          'Innovator — Technical Showcase',
          'Observer — Institutional Delegation',
        ]),
        isDemoSeed: true,
      })
      .onConflictDoUpdate({
        target: events.slug,
        set: { status: 'LIVE' },
      })
      .returning();

    const [isolatedEvent] = await db
      .insert(events)
      .values({
        slug: 'autonomous-infrastructure-colloquium-2026',
        organisationId: isolationFixtureOrg.id,
        title: 'Isolated Tenant Event B (Security Fixture)',
        subtitle: 'Cross-Event Authorization Boundary Test Fixture',
        description:
          'Synthetic event fixture used exclusively by the Security Inspector to verify that an Organiser for Event A is blocked from administering Event B.',
        location: 'Sandbox Environment',
        datesLabel: 'Security Fixture',
        startDate: '2026-11-14',
        endDate: '2026-11-15',
        status: 'ISOLATION_FIXTURE',
        categories: JSON.stringify(['Security Auditor']),
        isDemoSeed: true,
      })
      .onConflictDoUpdate({
        target: events.slug,
        set: { status: 'ISOLATION_FIXTURE' },
      })
      .returning();

    // 3. Seed Showcase Demo Users (All explicitly marked isDemoSeed: true)
    const [organiserArjun] = await db
      .insert(users)
      .values({
        uid: 'auvresence-demo-organiser-arjun',
        email: 'organiser.demo@auvresence.showcase',
        displayName: 'Showcase Organiser (Account B)',
        institution: 'Auvresence Demo Operations',
        activeRole: 'ORGANISER',
        isDemoSeed: true,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: { activeRole: 'ORGANISER', isDemoSeed: true },
      })
      .returning();

    const [organiserIsolation] = await db
      .insert(users)
      .values({
        uid: 'auvresence-demo-organiser-astrid',
        email: 'tenant-b.demo@auvresence.showcase',
        displayName: 'Tenant B Organiser (Security Fixture)',
        institution: 'Security Isolation Fixture',
        activeRole: 'ORGANISER',
        isDemoSeed: true,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: { activeRole: 'ORGANISER', isDemoSeed: true },
      })
      .returning();

    const [participantShaurya] = await db
      .insert(users)
      .values({
        uid: 'auvresence-demo-participant-shaurya',
        email: 'shaurya.demo@auvresence.showcase',
        displayName: 'Shaurya Agrawal',
        institution: 'Chandigarh University, Uttar Pradesh (Demo Account)',
        activeRole: 'PARTICIPANT',
        isDemoSeed: true,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: { activeRole: 'PARTICIPANT', isDemoSeed: true },
      })
      .returning();

    const [participantMeera] = await db
      .insert(users)
      .values({
        uid: 'auvresence-demo-participant-meera',
        email: 'participant-b.demo@auvresence.showcase',
        displayName: 'Demo Participant B (Isolation Fixture)',
        institution: 'Showcase Demo Record',
        activeRole: 'PARTICIPANT',
        isDemoSeed: true,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: { activeRole: 'PARTICIPANT', isDemoSeed: true },
      })
      .returning();

    const [participantRohan] = await db
      .insert(users)
      .values({
        uid: 'auvresence-demo-participant-rohan',
        email: 'applicant-c.demo@auvresence.showcase',
        displayName: 'Demo Applicant C (Showcase Fixture)',
        institution: 'Showcase Demo Record',
        activeRole: 'PARTICIPANT',
        isDemoSeed: true,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: { activeRole: 'PARTICIPANT', isDemoSeed: true },
      })
      .returning();

    // 4. Bind Organisers to specific Events (Resource Isolation)
    await db
      .insert(eventOrganisers)
      .values([
        {
          eventId: summitEvent.id,
          userId: organiserArjun.id,
          roleTitle: 'Showcase Organiser',
        },
        {
          eventId: isolatedEvent.id,
          userId: organiserIsolation.id,
          roleTitle: 'Tenant B Organiser',
        },
      ])
      .onConflictDoNothing();

    // 5. Seed Venues for Event 1
    const insertedVenues = await db
      .insert(venues)
      .values([
        {
          eventId: summitEvent.id,
          name: 'Registration',
          shortDescription:
            'Arrival concourse for digital credential verification and delegate induction.',
          floor: 'Floor 1',
          zone: 'Arrival Concourse',
          mapX: 18,
          mapY: 58,
          waypointToken: 'wp_reg_' + generateOpaqueToken(12),
          capacity: 150,
          isDemoSeed: true,
        },
        {
          eventId: summitEvent.id,
          name: 'Main Hall',
          shortDescription:
            'Primary plenary amphitheatre for keynote addresses and opening assembly.',
          floor: 'Floor 2',
          zone: 'Plenary Wing',
          mapX: 50,
          mapY: 22,
          waypointToken: 'wp_main_' + generateOpaqueToken(12),
          capacity: 400,
          isDemoSeed: true,
        },
        {
          eventId: summitEvent.id,
          name: 'Lab 301',
          shortDescription:
            'Policy drafting chamber and institutional governance working room.',
          floor: 'Floor 3',
          zone: 'Policy Wing',
          mapX: 25,
          mapY: 36,
          waypointToken: 'wp_lab301_' + generateOpaqueToken(12),
          capacity: 60,
          isDemoSeed: true,
        },
        {
          eventId: summitEvent.id,
          name: 'Lab 302',
          shortDescription:
            'Applied AI systems studio equipped for interactive technical workshops.',
          floor: 'Floor 3',
          zone: 'Innovation Zone',
          mapX: 74,
          mapY: 36,
          waypointToken: 'wp_lab302_' + generateOpaqueToken(12),
          capacity: 75,
          isDemoSeed: true,
        },
        {
          eventId: summitEvent.id,
          name: 'Lab 305',
          shortDescription:
            'High-capacity project demonstration studio for live engineering builds and AI workshops.',
          floor: 'Floor 3',
          zone: 'Project Zone',
          mapX: 80,
          mapY: 64,
          waypointToken: 'wp_lab305_' + generateOpaqueToken(12),
          capacity: 120,
          isDemoSeed: true,
        },
        {
          eventId: summitEvent.id,
          name: 'Help Desk',
          shortDescription:
            'Delegate assistance, schedule inquiries, and venue logistics desk.',
          floor: 'Floor 1',
          zone: 'Central Atrium',
          mapX: 50,
          mapY: 82,
          waypointToken: 'wp_help_' + generateOpaqueToken(12),
          capacity: 30,
          isDemoSeed: true,
        },
      ])
      .returning();

    const venueMap = new Map(insertedVenues.map((v) => [v.name, v]));
    const mainHall = venueMap.get('Main Hall')!;
    const lab302 = venueMap.get('Lab 302')!;
    const lab305 = venueMap.get('Lab 305')!;
    const lab301 = venueMap.get('Lab 301')!;
    const registrationVenue = venueMap.get('Registration')!;

    // 6. Seed Sessions for Event 1
    await db.insert(sessions).values([
      {
        eventId: summitEvent.id,
        venueId: mainHall.id,
        title: 'Opening Session',
        description:
          'Inaugural address on connected event ecosystems, institutional memory, and delegate induction.',
        speaker: 'Summit Directorate · Auvreo International',
        startTime: '11:15',
        endTime: '12:00',
        dayLabel: 'Day 1 · 25 Dec 2026',
        track: 'All Delegates',
        status: 'HAPPENING_NOW',
        isDemoSeed: true,
      },
      {
        eventId: summitEvent.id,
        venueId: lab302.id,
        title: 'AI Workshop',
        description:
          'Technical workshop on context-bounded event intelligence, authorization boundaries, and live operational state.',
        speaker: 'Systems Architecture Group',
        startTime: '12:30',
        endTime: '13:30',
        dayLabel: 'Day 1 · 25 Dec 2026',
        track: 'All Delegates',
        status: 'UP_NEXT',
        isDemoSeed: true,
      },
      {
        eventId: summitEvent.id,
        venueId: lab305.id,
        title: 'Project Showcase',
        description:
          'Live evaluation of inter-institutional engineering prototypes and digital credential systems.',
        speaker: 'Technical Review Committee',
        startTime: '14:15',
        endTime: '15:30',
        dayLabel: 'Day 1 · 25 Dec 2026',
        track: 'Innovator — Technical Showcase',
        status: 'UPCOMING',
        isDemoSeed: true,
      },
      {
        eventId: summitEvent.id,
        venueId: lab301.id,
        title: 'Governance & Digital Identity Colloquium',
        description:
          'Roundtable on privacy-conscious verification and minimal public disclosure protocols.',
        speaker: 'Policy & Governance Working Group',
        startTime: '16:00',
        endTime: '17:15',
        dayLabel: 'Day 1 · 25 Dec 2026',
        track: 'Delegate — AI & Systems Policy',
        status: 'UPCOMING',
        isDemoSeed: true,
      },
    ]);

    // 7. Seed Announcements
    await db.insert(announcements).values([
      {
        eventId: summitEvent.id,
        authorUserId: organiserArjun.id,
        title: 'Arrival & Digital Credential Protocol',
        body: 'Welcome to the Auvreo International Youth Summit — India 2026. All applicants can track their review status directly in Auvresence. Once accepted, your digital credential activates immediately.',
        audience: 'ALL_APPLICANTS',
        priority: 'STANDARD',
        isDemoSeed: true,
      },
      {
        eventId: summitEvent.id,
        authorUserId: organiserArjun.id,
        title: 'Delegate Briefing: Floor 3 Innovation & Project Zones Active',
        body: 'Accepted participants may now access Floor 3 laboratories for technical sessions. Please consult Event Pulse prior to 12:30 for any room reassignments.',
        audience: 'ACCEPTED_ONLY',
        priority: 'IMPORTANT',
        isDemoSeed: true,
      },
      {
        eventId: summitEvent.id,
        authorUserId: organiserArjun.id,
        title: 'Organiser Ops Note: AI Workshop Room Capacity',
        body: 'Internal organiser note: If accepted delegate count increases, move the 12:30 AI Workshop from Lab 302 to Lab 305 (Project Zone).',
        audience: 'ORGANISERS_ONLY',
        priority: 'STANDARD',
        isDemoSeed: true,
      },
    ]);

    // 8. Seed Resources
    await db.insert(resources).values([
      {
        eventId: summitEvent.id,
        title: 'Summit Delegate Charter & Briefing Dossier',
        description:
          'Complete programme structure, working group themes, and code of conduct for accepted delegates.',
        url: 'https://auvreo.org/summit-2026/delegate-dossier',
        category: 'Briefing Dossier',
        audience: 'ACCEPTED_ONLY',
        isDemoSeed: true,
      },
      {
        eventId: summitEvent.id,
        title: 'Auvresence Architecture & Security Overview',
        description:
          'Technical documentation covering server-enforced authorization, opaque QR verification tokens, and AI context isolation.',
        url: 'https://auvreo.org/summit-2026/architecture-note',
        category: 'Technical Paper',
        audience: 'ACCEPTED_ONLY',
        isDemoSeed: true,
      },
      {
        eventId: summitEvent.id,
        title: 'New Delhi Venue Transit & Arrival Guide',
        description:
          'Public orientation guide covering arrival gates, floor layout, and registration desk timings.',
        url: 'https://auvreo.org/summit-2026/arrival-guide',
        category: 'Logistics',
        audience: 'ALL_APPLICANTS',
        isDemoSeed: true,
      },
    ]);

    // 9. Seed Showcase Fixture Applications & Credentials
    const [peerApp] = await db
      .insert(applications)
      .values({
        eventId: summitEvent.id,
        userId: participantMeera.id,
        applicantName: 'Demo Participant B (Showcase Fixture)',
        applicantEmail: 'participant-b.demo@auvresence.showcase',
        institution: 'Showcase Demo Record',
        category: 'Delegate — AI & Systems Policy',
        statement:
          'Synthetic showcase fixture record used to demonstrate resource isolation (Participant A cannot read Participant B’s private application).',
        status: 'ACCEPTED',
        reviewedByUserId: organiserArjun.id,
        reviewedAt: new Date(),
        isDemoSeed: true,
      })
      .returning();

    await db.insert(credentials).values({
      applicationId: peerApp.id,
      eventId: summitEvent.id,
      userId: participantMeera.id,
      participantCode: 'AUV-2026-0142',
      verificationToken: 'auv_verify_fixture_' + generateOpaqueToken(16),
      roleCategory: 'Delegate — AI & Systems Policy',
      status: 'ACTIVE',
    });

    await db.insert(applications).values({
      eventId: summitEvent.id,
      userId: participantRohan.id,
      applicantName: 'Demo Applicant C (Showcase Fixture)',
      applicantEmail: 'applicant-c.demo@auvresence.showcase',
      institution: 'Showcase Demo Record',
      category: 'Innovator — Technical Showcase',
      statement:
        'Synthetic showcase fixture application awaiting organiser review.',
      status: 'UNDER_REVIEW',
      isDemoSeed: true,
    });

    const [shauryaApp] = await db
      .insert(applications)
      .values({
        eventId: summitEvent.id,
        userId: participantShaurya.id,
        applicantName: 'Shaurya Agrawal',
        applicantEmail: 'shaurya.demo@auvresence.showcase',
        institution: 'Chandigarh University, Uttar Pradesh (Demo Account)',
        category: 'Innovator — Technical Showcase',
        statement:
          'Demonstrating connected event intelligence uniting organiser operations, participant experience, venue awareness, and context-bounded AI at Technovate 2026.',
        status: 'ACCEPTED',
        reviewedByUserId: organiserArjun.id,
        reviewedAt: new Date(),
        isDemoSeed: true,
      })
      .returning();

    await db.insert(credentials).values({
      applicationId: shauryaApp.id,
      eventId: summitEvent.id,
      userId: participantShaurya.id,
      participantCode: 'AUV-2026-0701',
      verificationToken: 'auv_verify_shaurya_' + generateOpaqueToken(16),
      roleCategory: 'Innovator — Technical Showcase',
      status: 'ACTIVE',
    });

    await db.insert(waypointScans).values([
      {
        eventId: summitEvent.id,
        userId: participantShaurya.id,
        venueId: registrationVenue.id,
        scannedAt: new Date(Date.now() - 45 * 60 * 1000),
      },
      {
        eventId: summitEvent.id,
        userId: participantShaurya.id,
        venueId: mainHall.id,
        scannedAt: new Date(Date.now() - 15 * 60 * 1000),
      },
    ]);

    await db.insert(auditLogs).values({
      eventId: summitEvent.id,
      actorUserId: organiserArjun.id,
      actorEmail: organiserArjun.email,
      action: 'ECOSYSTEM_INITIALISED',
      resourceType: 'EVENT',
      resourceId: String(summitEvent.id),
      details:
        'Showcase seed data initialised for Auvreo International Youth Summit — India 2026.',
    });
  } catch (error) {
    console.error('Error seeding showcase data:', error);
  } finally {
    isSeeding = false;
  }
}

export async function switchUserActiveRole(
  userId: number,
  role: 'PARTICIPANT' | 'ORGANISER'
) {
  try {
    // Showcase-only operation. Real accounts can never be promoted this way.
    const [target] = await db.select().from(users).where(eq(users.id, userId));
    if (!target || !target.isDemoSeed) {
      throw new Error('Role switching is only available to showcase identities.');
    }
    const [updated] = await db
      .update(users)
      .set({ activeRole: role })
      .where(eq(users.id, userId))
      .returning();

    if (role === 'ORGANISER') {
      const [primaryEvent] = await db
        .select()
        .from(events)
        .where(eq(events.slug, 'auvreo-youth-summit-2026'));

      if (primaryEvent) {
        await db
          .insert(eventOrganisers)
          .values({
            eventId: primaryEvent.id,
            userId,
            roleTitle: 'Showcase Organiser',
          })
          .onConflictDoNothing();
      }
    }

    return updated;
  } catch (error) {
    console.error('Database query failed in switchUserActiveRole:', error);
    throw new Error('Failed to switch user role.', { cause: error });
  }
}

export async function isUserOrganiserForEvent(
  userId: number,
  eventId: number
): Promise<boolean> {
  try {
    const userRows = await db.select().from(users).where(eq(users.id, userId));
    const user = userRows[0];
    if (!user) {
      return false;
    }

    // Showcase identities only hold organiser authority while their showcase
    // role is ORGANISER. Real accounts: authority is purely event membership.
    if (user.isDemoSeed && user.activeRole !== 'ORGANISER') {
      return false;
    }

    const membership = await db
      .select()
      .from(eventOrganisers)
      .where(
        and(
          eq(eventOrganisers.userId, userId),
          eq(eventOrganisers.eventId, eventId)
        )
      );

    return membership.length > 0;
  } catch (error) {
    console.error('Database query failed in isUserOrganiserForEvent:', error);
    throw new Error('Authorization check failed.', { cause: error });
  }
}

export async function getPublishedEvents(includeNonPublicForJourneys = false) {
  try {
    await ensureShowcaseDataSeeded();
    const allEvents = await db
      .select({
        id: events.id,
        slug: events.slug,
        title: events.title,
        subtitle: events.subtitle,
        eventType: events.eventType,
        description: events.description,
        location: events.location,
        datesLabel: events.datesLabel,
        startDate: events.startDate,
        endDate: events.endDate,
        timezone: events.timezone,
        expectedParticipants: events.expectedParticipants,
        visibility: events.visibility,
        applicationStatus: events.applicationStatus,
        applicationConfig: events.applicationConfig,
        venueName: events.venueName,
        venueAddress: events.venueAddress,
        venuePublished: events.venuePublished,
        status: events.status,
        categories: events.categories,
        isDemoSeed: events.isDemoSeed,
        organisationName: organisations.name,
        organisationSlug: organisations.slug,
        organisationHq: organisations.headquarters,
      })
      .from(events)
      .innerJoin(organisations, eq(events.organisationId, organisations.id))
      .where(and(
        ne(events.status, 'ISOLATION_FIXTURE'),
        includeNonPublicForJourneys ? undefined : eq(events.visibility, 'PUBLIC'),
        includeNonPublicForJourneys ? undefined : inArray(events.status, ['PUBLISHED', 'LIVE'])
      ))
      .orderBy(asc(events.id));

    return allEvents.map((e) => ({
      ...e,
      applicationStatus: (e.applicationStatus || 'OPEN') as
        | 'COMING_SOON'
        | 'OPEN'
        | 'CLOSED',
      applicationConfig: e.applicationConfig
        ? JSON.parse(e.applicationConfig)
        : {
            requirePhone: false,
            customQuestionLabel: '',
            customQuestionRequired: false,
          },
      categories: JSON.parse(e.categories) as string[],
    }));
  } catch (error) {
    console.error('Database query failed in getPublishedEvents:', error);
    throw new Error('Failed to load events.', { cause: error });
  }
}

export async function getIsolationFixtureEventId(): Promise<number> {
  try {
    await ensureShowcaseDataSeeded();
    const rows = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, 'autonomous-infrastructure-colloquium-2026'));
    return rows[0]?.id || 2;
  } catch {
    return 2;
  }
}

export async function getEventFullContext(eventId: number, userId?: number) {
  try {
    await ensureShowcaseDataSeeded();
    const eventRows = await db
      .select({
        id: events.id,
        slug: events.slug,
        title: events.title,
        subtitle: events.subtitle,
        eventType: events.eventType,
        description: events.description,
        location: events.location,
        datesLabel: events.datesLabel,
        startDate: events.startDate,
        endDate: events.endDate,
        timezone: events.timezone,
        expectedParticipants: events.expectedParticipants,
        visibility: events.visibility,
        applicationStatus: events.applicationStatus,
        applicationConfig: events.applicationConfig,
        venueName: events.venueName,
        venueAddress: events.venueAddress,
        venuePublished: events.venuePublished,
        status: events.status,
        categories: events.categories,
        isDemoSeed: events.isDemoSeed,
        organisationName: organisations.name,
        organisationDescription: organisations.description,
        organisationHq: organisations.headquarters,
      })
      .from(events)
      .innerJoin(organisations, eq(events.organisationId, organisations.id))
      .where(eq(events.id, eventId));

    const event = eventRows[0];
    if (!event) return null;

    // ---- ACCESS DECISION (server is the authority; client input never counts) ----
    const viewerIsOrganiser = userId
      ? await isUserOrganiserForEvent(userId, eventId)
      : false;
    let viewerHasApplication = false;
    if (userId && !viewerIsOrganiser) {
      const own = await db
        .select({ id: applications.id })
        .from(applications)
        .where(
          and(eq(applications.eventId, eventId), eq(applications.userId, userId))
        );
      viewerHasApplication = own.length > 0;
    }
    // PRIVATE events are invisible (as if non-existent) to everyone except the
    // organising team and people who already hold an application to them.
    if (
      event.visibility === 'PRIVATE' &&
      !viewerIsOrganiser &&
      !viewerHasApplication
    ) {
      throw new EventAccessDeniedError();
    }

    const rawFloors = await db
      .select()
      .from(venueFloors)
      .where(eq(venueFloors.eventId, eventId))
      .orderBy(asc(venueFloors.levelOrder), asc(venueFloors.id));

    const eventFloors = rawFloors.map((f) => ({
      id: f.id,
      eventId: f.eventId,
      name: f.name,
      levelOrder: f.levelOrder,
      description: f.description,
      recordedPath: f.recordedPathJson
        ? (JSON.parse(f.recordedPathJson) as Array<{ x: number; y: number }>)
        : [],
      recordedDistanceMeters: f.recordedDistanceMeters || 0,
    }));

    const rawVenues = await db
      .select()
      .from(venues)
      .where(eq(venues.eventId, eventId))
      .orderBy(asc(venues.id));

    const eventVenues = rawVenues.map((v) => ({
      ...v,
      poiType: (v.poiType || 'ROOM') as any,
      poiCategory: (v.poiCategory || 'EVENT') as any,
      operationalStatus: (v.operationalStatus || 'OPEN') as any,
      accessible: v.accessible ?? true,
      connectedFloors: v.connectedFloorNames
        ? (JSON.parse(v.connectedFloorNames) as string[])
        : [],
    }));

    const eventEdges = await db
      .select()
      .from(venueEdges)
      .where(eq(venueEdges.eventId, eventId))
      .orderBy(asc(venueEdges.id));

    const eventSessions = await db
      .select({
        id: sessions.id,
        eventId: sessions.eventId,
        venueId: sessions.venueId,
        title: sessions.title,
        description: sessions.description,
        speaker: sessions.speaker,
        startTime: sessions.startTime,
        endTime: sessions.endTime,
        dayLabel: sessions.dayLabel,
        track: sessions.track,
        status: sessions.status,
        lastUpdatedNote: sessions.lastUpdatedNote,
        updatedAt: sessions.updatedAt,
        venueName: venues.name,
        venueFloor: venues.floor,
        venueZone: venues.zone,
        venueMapX: venues.mapX,
        venueMapY: venues.mapY,
        venueOperationalStatus: venues.operationalStatus,
      })
      .from(sessions)
      .leftJoin(venues, eq(sessions.venueId, venues.id))
      .where(eq(sessions.eventId, eventId))
      .orderBy(asc(sessions.startTime), asc(sessions.id));

    let myApplication = null;
    let myCredential = null;
    let isOrganiser = false;
    let waypointTrail: Array<{
      id: number;
      venueId: number;
      venueName: string;
      venueFloor: string;
      venueZone: string;
      scannedAt: Date | null;
    }> = [];

    if (userId) {
      isOrganiser = await isUserOrganiserForEvent(userId, eventId);

      const appRows = await db
        .select()
        .from(applications)
        .where(
          and(
            eq(applications.eventId, eventId),
            eq(applications.userId, userId)
          )
        );
      myApplication = appRows[0] || null;

      if (myApplication) {
        const credRows = await db
          .select()
          .from(credentials)
          .where(eq(credentials.applicationId, myApplication.id));
        myCredential = credRows[0] || null;
      }

      waypointTrail = await db
        .select({
          id: waypointScans.id,
          venueId: waypointScans.venueId,
          venueName: venues.name,
          venueFloor: venues.floor,
          venueZone: venues.zone,
          scannedAt: waypointScans.scannedAt,
        })
        .from(waypointScans)
        .innerJoin(venues, eq(waypointScans.venueId, venues.id))
        .where(
          and(
            eq(waypointScans.eventId, eventId),
            eq(waypointScans.userId, userId)
          )
        )
        .orderBy(asc(waypointScans.scannedAt));
    }

    const isAccepted = myApplication?.status === 'ACCEPTED';
    const canSeeVenue =
      isOrganiser || (isAccepted && event.venuePublished !== false);

    // Audience filtering enforced strictly on the server
    const allowedAnnouncementAudiences = isOrganiser
      ? ['ALL_APPLICANTS', 'ACCEPTED_ONLY', 'ORGANISERS_ONLY']
      : isAccepted
      ? ['ALL_APPLICANTS', 'ACCEPTED_ONLY']
      : ['ALL_APPLICANTS'];

    const rawAnnouncements = await db
      .select()
      .from(announcements)
      .where(
        and(
          eq(announcements.eventId, eventId),
          inArray(announcements.audience, allowedAnnouncementAudiences)
        )
      )
      .orderBy(desc(announcements.publishedAt), desc(announcements.id));

    const venueMapById = new Map(eventVenues.map((v) => [v.id, v.name]));
    const sessionMapById = new Map(eventSessions.map((s) => [s.id, s.title]));

    const visibleAnnouncements = rawAnnouncements.map((a) => ({
      ...a,
      attachedVenueName: a.attachedVenueId
        ? venueMapById.get(a.attachedVenueId) || null
        : null,
      attachedSessionTitle: a.attachedSessionId
        ? sessionMapById.get(a.attachedSessionId) || null
        : null,
    }));

    const allowedResourceAudiences =
      isOrganiser || isAccepted
        ? ['ALL_APPLICANTS', 'ACCEPTED_ONLY']
        : ['ALL_APPLICANTS'];

    const visibleResources = await db
      .select()
      .from(resources)
      .where(
        and(
          eq(resources.eventId, eventId),
          inArray(resources.audience, allowedResourceAudiences)
        )
      )
      .orderBy(asc(resources.id));

    // Truthful "now": only a session the organiser has marked as happening.
    const happeningNow =
      eventSessions.find((s) => s.status === 'HAPPENING_NOW') || null;

    const upNext =
      eventSessions.find((s) => s.status === 'UP_NEXT') ||
      eventSessions.find(
        (s) =>
          s.status === 'UPCOMING' &&
          (!happeningNow || s.id !== happeningNow.id)
      ) ||
      null;

    const nextDestinationVenue = upNext
      ? eventVenues.find((v) => v.id === upNext.venueId) || null
      : happeningNow
      ? eventVenues.find((v) => v.id === happeningNow.venueId) || null
      : null;

    const latestUpdate = visibleAnnouncements[0] || null;

    return {
      event: {
        ...event,
        applicationStatus: (event.applicationStatus || 'OPEN') as
          | 'COMING_SOON'
          | 'OPEN'
          | 'CLOSED',
        applicationConfig: event.applicationConfig
          ? JSON.parse(event.applicationConfig)
          : {
              requirePhone: false,
              customQuestionLabel: '',
              customQuestionRequired: false,
            },
        categories: JSON.parse(event.categories) as string[],
      },
      // Venue graph is visible only to the organising team and to accepted
      // participants of an event whose venue is published. Waypoint tokens
      // (QR secrets) are organiser-only.
      floors: canSeeVenue ? eventFloors : [],
      venues: canSeeVenue
        ? eventVenues.map((v) =>
            isOrganiser ? v : { ...v, waypointToken: '' }
          )
        : [],
      edges: canSeeVenue ? eventEdges : [],
      sessions: eventSessions,
      announcements: visibleAnnouncements,
      resources: visibleResources,
      myApplication,
      myCredential,
      isOrganiser,
      waypointTrail,
      pulse: {
        serverTimestamp: new Date().toISOString(),
        happeningNow,
        upNext,
        latestUpdate,
        nextDestination: nextDestinationVenue,
      },
    };
  } catch (error) {
    if (error instanceof EventAccessDeniedError) throw error;
    console.error('Database query failed in getEventFullContext:', error);
    throw new Error('Failed to load event state.', { cause: error });
  }
}

export async function getApplicationById(applicationId: number) {
  try {
    const rows = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId));
    return rows[0] || null;
  } catch (error) {
    console.error('Database query failed in getApplicationById:', error);
    throw new Error('Failed to fetch application.', { cause: error });
  }
}

export async function getPeerApplicationIdForIsolationTest(
  currentUserId: number
): Promise<number | null> {
  try {
    const allApps = await db.select().from(applications);
    const otherApp = allApps.find((a) => a.userId !== currentUserId);
    return otherApp ? otherApp.id : null;
  } catch (error) {
    console.error(
      'Database query failed in getPeerApplicationIdForIsolationTest:',
      error
    );
    return null;
  }
}

export async function submitParticipantApplication(input: {
  eventId: number;
  userId: number;
  applicantName: string;
  applicantEmail: string;
  phone?: string;
  institution: string;
  category: string;
  statement: string;
  customAnswer?: string;
  isDemoUser?: boolean;
}) {
  try {
    const [ev] = await db
      .select()
      .from(events)
      .where(eq(events.id, input.eventId));
    if (!ev) {
      throw new Error('Event not found.');
    }
    if (ev.applicationStatus === 'CLOSED') {
      throw new Error('Applications for this event are currently closed.');
    }
    if (ev.applicationStatus === 'COMING_SOON') {
      throw new Error('Applications for this event have not opened yet.');
    }

    const existing = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.eventId, input.eventId),
          eq(applications.userId, input.userId)
        )
      );

    if (ev.visibility === 'PRIVATE' && existing.length === 0) {
      // Private events cannot be discovered or applied to by ID alone.
      throw new Error('Event not found.');
    }

    if (existing.length > 0) {
      if (existing[0].status === 'ACCEPTED') {
        throw new Error('You have already been accepted to this event.');
      }
      const [updated] = await db
        .update(applications)
        .set({
          applicantName: input.applicantName,
          phone: input.phone || null,
          institution: input.institution,
          category: input.category,
          statement: input.statement,
          customAnswer: input.customAnswer || null,
          status: 'UNDER_REVIEW',
        })
        .where(eq(applications.id, existing[0].id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(applications)
      .values({
        eventId: input.eventId,
        userId: input.userId,
        applicantName: input.applicantName,
        applicantEmail: input.applicantEmail,
        phone: input.phone || null,
        institution: input.institution,
        category: input.category,
        statement: input.statement,
        customAnswer: input.customAnswer || null,
        status: 'UNDER_REVIEW',
        isDemoSeed: Boolean(input.isDemoUser),
      })
      .returning();

    await db.insert(auditLogs).values({
      eventId: input.eventId,
      actorUserId: input.userId,
      actorEmail: input.applicantEmail,
      action: 'APPLICATION_SUBMITTED',
      resourceType: 'APPLICATION',
      resourceId: String(created.id),
      details: `${input.applicantName} applied under ${input.category}`,
    });

    return created;
  } catch (error) {
    console.error(
      'Database query failed in submitParticipantApplication:',
      error
    );
    throw error instanceof Error
      ? error
      : new Error('Failed to submit application.', { cause: error });
  }
}

export async function getOrganiserDashboardData(eventId: number) {
  try {
    const allApps = await db
      .select()
      .from(applications)
      .where(eq(applications.eventId, eventId))
      .orderBy(desc(applications.createdAt), desc(applications.id));

    const allCreds = await db
      .select()
      .from(credentials)
      .where(eq(credentials.eventId, eventId));

    const credByAppId = new Map(allCreds.map((c) => [c.applicationId, c]));

    const enrichedApplications = allApps.map((app) => ({
      ...app,
      credential: credByAppId.get(app.id) || null,
    }));

    const stats = {
      totalApplications: allApps.length,
      underReview: allApps.filter((a) => a.status === 'UNDER_REVIEW').length,
      acceptedParticipants: allApps.filter((a) => a.status === 'ACCEPTED')
        .length,
      rejected: allApps.filter((a) => a.status === 'REJECTED').length,
      activeCredentials: allCreds.filter((c) => c.status === 'ACTIVE').length,
    };

    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.eventId, eventId))
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(25);

    return {
      stats,
      applications: enrichedApplications,
      auditLogs: logs,
    };
  } catch (error) {
    console.error('Database query failed in getOrganiserDashboardData:', error);
    throw new Error('Failed to load organiser operations data.', {
      cause: error,
    });
  }
}

export async function reviewApplicationByOrganiser(input: {
  applicationId: number;
  status: 'ACCEPTED' | 'REJECTED' | 'UNDER_REVIEW';
  reviewerUserId: number;
  reviewerEmail: string;
}) {
  try {
    return await db.transaction(async (tx) => {
      const appRows = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, input.applicationId)).for('update');
      const app = appRows[0];
      if (!app) {
        throw new Error('Application not found.');
      }

      const [updatedApp] = await tx
        .update(applications)
        .set({
          status: input.status,
          reviewedByUserId: input.reviewerUserId,
          reviewedAt: new Date(),
        })
        .where(eq(applications.id, input.applicationId))
        .returning();

      let credentialRecord = null;
      const existingCreds = await tx
        .select()
        .from(credentials)
        .where(eq(credentials.applicationId, app.id));

      if (input.status === 'ACCEPTED') {
        if (existingCreds.length > 0) {
          const [reactivated] = await tx
            .update(credentials)
            .set({
              status: 'ACTIVE',
              roleCategory: app.category,
            })
            .where(eq(credentials.id, existingCreds[0].id))
            .returning();
          credentialRecord = reactivated;
        } else {
          const [createdCred] = await tx
            .insert(credentials)
            .values({
              applicationId: app.id,
              eventId: app.eventId,
              userId: app.userId,
              participantCode: generateParticipantCode(app.id),
              verificationToken: 'auv_verify_' + generateOpaqueToken(18),
              roleCategory: app.category,
              status: 'ACTIVE',
            })
            .returning();
          credentialRecord = createdCred;
        }
      } else if (existingCreds.length > 0) {
        const [revoked] = await tx
          .update(credentials)
          .set({ status: 'REVOKED' })
          .where(eq(credentials.id, existingCreds[0].id))
          .returning();
        credentialRecord = revoked;
      }

      await tx.insert(auditLogs).values({
        eventId: app.eventId,
        actorUserId: input.reviewerUserId,
        actorEmail: input.reviewerEmail,
        action: `APPLICATION_${input.status}`,
        resourceType: 'APPLICATION',
        resourceId: String(app.id),
        details: `Application for ${app.applicantName} marked as ${input.status}.`,
      });

      return {
        application: updatedApp,
        credential: credentialRecord,
      };
    });
  } catch (error) {
    console.error(
      'Database query failed in reviewApplicationByOrganiser:',
      error
    );
    throw new Error('Failed to update application status.', { cause: error });
  }
}

export async function updateCredentialById(
  credentialId: number
) {
  try {
    const rows = await db
      .select()
      .from(credentials)
      .where(eq(credentials.id, credentialId));
    return rows[0] || null;
  } catch (error) {
    console.error('Database query failed in updateCredentialById:', error);
    return null;
  }
}

export async function updateCredentialStatusByOrganiser(input: {
  credentialId: number;
  status: 'ACTIVE' | 'REVOKED';
  actorUserId: number;
  actorEmail: string;
}) {
  try {
    const [updated] = await db
      .update(credentials)
      .set({ status: input.status })
      .where(eq(credentials.id, input.credentialId))
      .returning();

    if (updated) {
      await db.insert(auditLogs).values({
        eventId: updated.eventId,
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail,
        action: `CREDENTIAL_${input.status}`,
        resourceType: 'CREDENTIAL',
        resourceId: String(updated.id),
        details: `Credential ${updated.participantCode} set to ${input.status}.`,
      });
    }
    return updated;
  } catch (error) {
    console.error(
      'Database query failed in updateCredentialStatusByOrganiser:',
      error
    );
    throw new Error('Failed to update credential status.', { cause: error });
  }
}

export async function verifyPublicCredentialByToken(token: string) {
  try {
    await ensureShowcaseDataSeeded();
    const rows = await db
      .select({
        credentialStatus: credentials.status,
        participantCode: credentials.participantCode,
        roleCategory: credentials.roleCategory,
        participantName: applications.applicantName,
        applicationStatus: applications.status,
        eventTitle: events.title,
      })
      .from(credentials)
      .innerJoin(applications, eq(credentials.applicationId, applications.id))
      .innerJoin(events, eq(credentials.eventId, events.id))
      .where(eq(credentials.verificationToken, token));

    const record = rows[0];
    if (!record) {
      return null;
    }

    const isValid =
      record.credentialStatus === 'ACTIVE' &&
      record.applicationStatus === 'ACCEPTED';

    // DATA MINIMISATION (Layer 6): Return ONLY minimal public verification data.
    // Never expose email, phone, Firebase UID, application statement, internal application ID, review notes, or database IDs.
    return {
      valid: isValid,
      status: isValid ? 'ACTIVE' : 'CREDENTIAL NOT VALID',
      participantName: record.participantName,
      participantCode: record.participantCode,
      roleCategory: record.roleCategory,
      eventTitle: record.eventTitle,
      verificationBasis:
        'Verified against current Auvresence registration state.',
      verifiedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(
      'Database query failed in verifyPublicCredentialByToken:',
      error
    );
    throw new Error('Credential verification lookup failed.', { cause: error });
  }
}

export async function updateSessionByOrganiser(input: {
  sessionId: number;
  eventId: number;
  title: string;
  description: string;
  speaker?: string;
  startTime: string;
  endTime: string;
  venueId?: number | null;
  status: 'COMPLETED' | 'HAPPENING_NOW' | 'UP_NEXT' | 'UPCOMING';
  actorUserId: number;
  actorEmail: string;
}) {
  try {
    const existingRows = await db
      .select({
        id: sessions.id,
        venueId: sessions.venueId,
        startTime: sessions.startTime,
        venueName: venues.name,
      })
      .from(sessions)
      .leftJoin(venues, eq(sessions.venueId, venues.id))
      .where(
        and(
          eq(sessions.id, input.sessionId),
          eq(sessions.eventId, input.eventId)
        )
      );

    const existing = existingRows[0];
    if (!existing) {
      throw new Error('Session not found for this event.');
    }

    const newVenueId = input.venueId ?? null;
    let targetVenue: { id: number; name: string } | null = null;
    if (newVenueId !== null) {
      const targetVenueRows = await db
        .select()
        .from(venues)
        .where(
          and(eq(venues.id, newVenueId), eq(venues.eventId, input.eventId))
        );
      targetVenue = targetVenueRows[0] ?? null;
      if (!targetVenue) {
        throw new Error('Selected place does not belong to this event.');
      }
    }

    let changeNote: string | null = null;
    if (existing.venueId !== newVenueId) {
      changeNote = targetVenue
        ? `LOCATION UPDATED · ${
            existing.venueName ? `Moved from ${existing.venueName} to` : 'Now at'
          } ${targetVenue.name}`
        : 'LOCATION UPDATED · Place removed from this session';
    } else if (existing.startTime !== input.startTime) {
      changeNote = `TIME UPDATED · Rescheduled from ${existing.startTime} to ${input.startTime}`;
    }

    const [updated] = await db
      .update(sessions)
      .set({
        title: input.title,
        description: input.description,
        speaker: input.speaker || null,
        startTime: input.startTime,
        endTime: input.endTime,
        venueId: newVenueId,
        status: input.status,
        lastUpdatedNote: changeNote,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, input.sessionId))
      .returning();

    await db.insert(auditLogs).values({
      eventId: input.eventId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      action:
        existing.venueId !== newVenueId
          ? 'SESSION_VENUE_CHANGED'
          : 'SESSION_UPDATED',
      resourceType: 'SESSION',
      resourceId: String(input.sessionId),
      details:
        changeNote ||
        `Updated session "${input.title}" (${input.startTime}–${input.endTime}${targetVenue ? ` at ${targetVenue.name}` : ''})`,
    });

    return updated;
  } catch (error) {
    console.error('Database query failed in updateSessionByOrganiser:', error);
    throw new Error('Failed to update session.', { cause: error });
  }
}

export async function createSessionByOrganiser(input: {
  eventId: number;
  title: string;
  description: string;
  speaker?: string;
  startTime: string;
  endTime: string;
  dayLabel: string;
  track: string;
  venueId?: number | null;
  status: 'COMPLETED' | 'HAPPENING_NOW' | 'UP_NEXT' | 'UPCOMING';
  actorUserId: number;
  actorEmail: string;
}) {
  try {
    const createVenueId = input.venueId ?? null;
    if (createVenueId !== null) {
      // Relationship integrity: the place must belong to THIS event.
      const own = await db
        .select({ id: venues.id })
        .from(venues)
        .where(
          and(eq(venues.id, createVenueId), eq(venues.eventId, input.eventId))
        );
      if (own.length === 0) {
        throw new Error('Selected place does not belong to this event.');
      }
    }
    const [created] = await db
      .insert(sessions)
      .values({
        eventId: input.eventId,
        venueId: createVenueId,
        title: input.title,
        description: input.description,
        speaker: input.speaker || null,
        startTime: input.startTime,
        endTime: input.endTime,
        dayLabel: input.dayLabel,
        track: input.track,
        status: input.status,
        isDemoSeed: false,
      })
      .returning();

    await db.insert(auditLogs).values({
      eventId: input.eventId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      action: 'SESSION_CREATED',
      resourceType: 'SESSION',
      resourceId: String(created.id),
      details: `Created session "${input.title}" (${input.startTime}–${input.endTime}).`,
    });

    return created;
  } catch (error) {
    console.error('Database query failed in createSessionByOrganiser:', error);
    throw new Error('Failed to create session.', { cause: error });
  }
}

export async function createAnnouncementByOrganiser(input: {
  eventId: number;
  title: string;
  body: string;
  announcementType?: string;
  attachedVenueId?: number | null;
  attachedSessionId?: number | null;
  audience: 'ALL_APPLICANTS' | 'ACCEPTED_ONLY' | 'ORGANISERS_ONLY';
  priority: 'STANDARD' | 'IMPORTANT' | 'URGENT';
  actorUserId: number;
  actorEmail: string;
}) {
  try {
    const [created] = await db
      .insert(announcements)
      .values({
        eventId: input.eventId,
        authorUserId: input.actorUserId,
        title: input.title,
        body: input.body,
        announcementType: input.announcementType || 'GENERAL',
        attachedVenueId: input.attachedVenueId || null,
        attachedSessionId: input.attachedSessionId || null,
        audience: input.audience,
        priority: input.priority,
        isDemoSeed: false,
      })
      .returning();

    await db.insert(auditLogs).values({
      eventId: input.eventId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      action: 'ANNOUNCEMENT_PUBLISHED',
      resourceType: 'ANNOUNCEMENT',
      resourceId: String(created.id),
      details: `Published "${input.title}" (${input.announcementType || 'GENERAL'} · ${input.priority}) for audience ${input.audience}.`,
    });

    return created;
  } catch (error) {
    console.error(
      'Database query failed in createAnnouncementByOrganiser:',
      error
    );
    throw new Error('Failed to publish announcement.', { cause: error });
  }
}

export async function createVenueByOrganiser(input: {
  eventId: number;
  floorId?: number | null;
  name: string;
  shortDescription: string;
  floor: string;
  zone: string;
  poiType?: string;
  poiCategory?: string;
  operationalStatus?: string;
  accessible?: boolean;
  connectedFloors?: string[];
  mapX: number;
  mapY: number;
  capacity?: number;
  actorUserId: number;
  actorEmail: string;
}) {
  try {
    const [created] = await db
      .insert(venues)
      .values({
        eventId: input.eventId,
        floorId: input.floorId || null,
        name: input.name,
        shortDescription: input.shortDescription,
        floor: input.floor,
        zone: input.zone,
        poiType: input.poiType || 'ROOM',
        poiCategory: input.poiCategory || 'EVENT',
        operationalStatus: input.operationalStatus || 'OPEN',
        accessible: input.accessible ?? true,
        connectedFloorNames: input.connectedFloors
          ? JSON.stringify(input.connectedFloors)
          : null,
        mapX: input.mapX,
        mapY: input.mapY,
        capacity: input.capacity || 80,
        waypointToken: 'wp_' + generateOpaqueToken(14),
        isDemoSeed: false,
      })
      .returning();

    await db.insert(auditLogs).values({
      eventId: input.eventId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      action: 'VENUE_CREATED',
      resourceType: 'VENUE',
      resourceId: String(created.id),
      details: `Added venue POI "${input.name}" (${input.poiType || 'ROOM'} · ${input.floor} · ${input.zone}).`,
    });

    return created;
  } catch (error) {
    console.error('Database query failed in createVenueByOrganiser:', error);
    throw new Error('Failed to create venue.', { cause: error });
  }
}

export async function updateVenueByOrganiser(input: {
  venueId: number;
  eventId: number;
  name: string;
  shortDescription: string;
  floor: string;
  zone: string;
  poiType: string;
  poiCategory: string;
  operationalStatus: 'OPEN' | 'CLOSED' | 'TEMPORARILY_UNAVAILABLE';
  accessible: boolean;
  connectedFloors?: string[];
  mapX: number;
  mapY: number;
  capacity?: number | null;
  actorUserId: number;
  actorEmail: string;
}) {
  try {
    const [updated] = await db
      .update(venues)
      .set({
        name: input.name,
        shortDescription: input.shortDescription,
        floor: input.floor,
        zone: input.zone,
        poiType: input.poiType,
        poiCategory: input.poiCategory,
        operationalStatus: input.operationalStatus,
        accessible: input.accessible,
        connectedFloorNames: input.connectedFloors
          ? JSON.stringify(input.connectedFloors)
          : null,
        mapX: input.mapX,
        mapY: input.mapY,
        capacity: input.capacity ?? 80,
      })
      .where(
        and(eq(venues.id, input.venueId), eq(venues.eventId, input.eventId))
      )
      .returning();

    if (!updated) {
      throw new Error('Venue location not found for this event.');
    }

    await db.insert(auditLogs).values({
      eventId: input.eventId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      action: 'VENUE_UPDATED',
      resourceType: 'VENUE',
      resourceId: String(updated.id),
      details: `Updated venue "${updated.name}" (${updated.floor} · Status: ${updated.operationalStatus}).`,
    });

    return updated;
  } catch (error) {
    console.error('Database query failed in updateVenueByOrganiser:', error);
    throw new Error('Failed to update venue location.', { cause: error });
  }
}

export async function createFloorByOrganiser(input: {
  eventId: number;
  name: string;
  levelOrder: number;
  description?: string;
  recordedPath?: Array<{ x: number; y: number }>;
  recordedDistanceMeters?: number;
  actorUserId: number;
  actorEmail: string;
}) {
  try {
    const [created] = await db
      .insert(venueFloors)
      .values({
        eventId: input.eventId,
        name: input.name,
        levelOrder: input.levelOrder,
        description: input.description || null,
        recordedPathJson: input.recordedPath
          ? JSON.stringify(input.recordedPath)
          : null,
        recordedDistanceMeters: input.recordedDistanceMeters || 0,
        isDemoSeed: false,
      })
      .returning();

    await db.insert(auditLogs).values({
      eventId: input.eventId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      action: 'FLOOR_CREATED',
      resourceType: 'FLOOR',
      resourceId: String(created.id),
      details: `Added venue floor "${created.name}" (Level ${created.levelOrder}).`,
    });

    return created;
  } catch (error) {
    console.error('Database query failed in createFloorByOrganiser:', error);
    throw new Error('Failed to create venue floor.', { cause: error });
  }
}

export async function updateFloorPathByOrganiser(input: {
  floorId: number;
  eventId: number;
  description?: string;
  recordedPath: Array<{ x: number; y: number }>;
  recordedDistanceMeters: number;
  actorUserId: number;
  actorEmail: string;
}) {
  try {
    const [updated] = await db
      .update(venueFloors)
      .set({
        description: input.description ?? undefined,
        recordedPathJson: JSON.stringify(input.recordedPath),
        recordedDistanceMeters: input.recordedDistanceMeters,
      })
      .where(
        and(
          eq(venueFloors.id, input.floorId),
          eq(venueFloors.eventId, input.eventId)
        )
      )
      .returning();

    if (!updated) {
      throw new Error('Floor not found for this event.');
    }

    await db.insert(auditLogs).values({
      eventId: input.eventId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      action: 'FLOOR_PATH_RECORDED',
      resourceType: 'FLOOR',
      resourceId: String(updated.id),
      details: `Recorded Walk-to-Map corridor path on ${updated.name} (${input.recordedPath.length} waypoints · ~${input.recordedDistanceMeters}m).`,
    });

    return updated;
  } catch (error) {
    console.error('Database query failed in updateFloorPathByOrganiser:', error);
    throw new Error('Failed to save floor path.', { cause: error });
  }
}

export async function createVenueEdgeByOrganiser(input: {
  eventId: number;
  fromVenueId: number;
  toVenueId: number;
  distanceMeters: number;
  accessible: boolean;
  isCrossFloor: boolean;
  actorUserId: number;
  actorEmail: string;
}) {
  try {
    const [created] = await db
      .insert(venueEdges)
      .values({
        eventId: input.eventId,
        fromVenueId: input.fromVenueId,
        toVenueId: input.toVenueId,
        distanceMeters: input.distanceMeters,
        accessible: input.accessible,
        isCrossFloor: input.isCrossFloor,
        isDemoSeed: false,
      })
      .returning();

    await db.insert(auditLogs).values({
      eventId: input.eventId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      action: 'VENUE_EDGE_CREATED',
      resourceType: 'VENUE_EDGE',
      resourceId: String(created.id),
      details: `Connected POI #${input.fromVenueId} ↔ POI #${input.toVenueId} (${input.distanceMeters}m · ${input.accessible ? 'Step-free' : 'Stairs'}).`,
    });

    return created;
  } catch (error) {
    console.error('Database query failed in createVenueEdgeByOrganiser:', error);
    throw new Error('Failed to create venue pathway connection.', {
      cause: error,
    });
  }
}

export async function deleteVenueEdgeByOrganiser(input: {
  edgeId: number;
  eventId: number;
  actorUserId: number;
  actorEmail: string;
}) {
  try {
    await db
      .delete(venueEdges)
      .where(
        and(
          eq(venueEdges.id, input.edgeId),
          eq(venueEdges.eventId, input.eventId)
        )
      );
    return { ok: true };
  } catch (error) {
    console.error('Database query failed in deleteVenueEdgeByOrganiser:', error);
    throw new Error('Failed to remove venue pathway connection.', {
      cause: error,
    });
  }
}

export async function createResourceByOrganiser(input: {
  eventId: number;
  title: string;
  description: string;
  url: string;
  category: string;
  audience: 'ALL_APPLICANTS' | 'ACCEPTED_ONLY';
  actorUserId: number;
  actorEmail: string;
}) {
  try {
    const [created] = await db
      .insert(resources)
      .values({
        eventId: input.eventId,
        title: input.title,
        description: input.description,
        url: input.url,
        category: input.category,
        audience: input.audience,
        isDemoSeed: false,
      })
      .returning();

    await db.insert(auditLogs).values({
      eventId: input.eventId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      action: 'RESOURCE_PUBLISHED',
      resourceType: 'RESOURCE',
      resourceId: String(created.id),
      details: `Published resource "${input.title}" (${input.audience}).`,
    });

    return created;
  } catch (error) {
    console.error('Database query failed in createResourceByOrganiser:', error);
    throw new Error('Failed to create resource.', { cause: error });
  }
}

// Resolves a venue's waypoint token SERVER-SIDE for an explicit "I'm here"
// check-in, so the token never has to be sent to participants' browsers.
export async function getWaypointTokenForVenue(
  eventId: number,
  venueId: number
): Promise<string | null> {
  const rows = await db
    .select({ token: venues.waypointToken })
    .from(venues)
    .where(and(eq(venues.id, venueId), eq(venues.eventId, eventId)));
  return rows[0]?.token ?? null;
}

export async function recordParticipantWaypointScan(input: {
  userId: number;
  waypointToken: string;
}) {
  try {
    const venueRows = await db
      .select()
      .from(venues)
      .where(eq(venues.waypointToken, input.waypointToken));
    const venue = venueRows[0];
    if (!venue) {
      throw new Error('Invalid or unrecognized waypoint token.');
    }

    const appRows = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.eventId, venue.eventId),
          eq(applications.userId, input.userId)
        )
      );
    const app = appRows[0];
    if (!app || app.status !== 'ACCEPTED') {
      throw new Error(
        'Access denied: Only accepted event participants may check in at venue waypoints.'
      );
    }

    const [scan] = await db
      .insert(waypointScans)
      .values({
        eventId: venue.eventId,
        userId: input.userId,
        venueId: venue.id,
        scannedAt: new Date(),
      })
      .returning();

    return {
      scan,
      venue,
    };
  } catch (error) {
    console.error(
      'Database query failed in recordParticipantWaypointScan:',
      error
    );
    throw error;
  }
}

// Locked-down Demo Reset: Only modifies records explicitly marked isDemoSeed=true
// belonging to the showcase demo fixture (Shaurya Agrawal + AI Workshop session)
export async function resetGoldenPathDemoState(input: {
  mode: 'STEP_1_UNAPPLIED' | 'ACCEPTED_READY';
}) {
  try {
    await ensureShowcaseDataSeeded();
    const [summitEvent] = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.slug, 'auvreo-youth-summit-2026'),
          eq(events.isDemoSeed, true)
        )
      );

    if (!summitEvent) throw new Error('Primary showcase event not found.');

    const [demoParticipant] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.uid, 'auvresence-demo-participant-shaurya'),
          eq(users.isDemoSeed, true)
        )
      );

    if (!demoParticipant) {
      throw new Error('Showcase demo participant fixture not found.');
    }

    const eventVenues = await db
      .select()
      .from(venues)
      .where(
        and(
          eq(venues.eventId, summitEvent.id),
          eq(venues.isDemoSeed, true)
        )
      );
    const lab302 = eventVenues.find((v) => v.name === 'Lab 302');

    // Reset only the demo-seeded AI Workshop session back to Lab 302
    if (lab302) {
      const eventSessions = await db
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.eventId, summitEvent.id),
            eq(sessions.isDemoSeed, true)
          )
        );
      const aiWorkshop = eventSessions.find((s) =>
        s.title.toLowerCase().includes('ai workshop')
      );
      if (aiWorkshop) {
        await db
          .update(sessions)
          .set({
            venueId: lab302.id,
            startTime: '12:30',
            endTime: '13:30',
            status: 'UP_NEXT',
            lastUpdatedNote: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(sessions.id, aiWorkshop.id),
              eq(sessions.isDemoSeed, true)
            )
          );
      }
    }

    // Only modify the demo participant's application (isDemoSeed=true)
    const existingApps = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.eventId, summitEvent.id),
          eq(applications.userId, demoParticipant.id),
          eq(applications.isDemoSeed, true)
        )
      );

    if (input.mode === 'STEP_1_UNAPPLIED') {
      await db
        .delete(waypointScans)
        .where(
          and(
            eq(waypointScans.eventId, summitEvent.id),
            eq(waypointScans.userId, demoParticipant.id)
          )
        );
      for (const app of existingApps) {
        await db
          .delete(credentials)
          .where(eq(credentials.applicationId, app.id));
        await db
          .delete(applications)
          .where(
            and(
              eq(applications.id, app.id),
              eq(applications.isDemoSeed, true)
            )
          );
      }
    } else if (input.mode === 'ACCEPTED_READY') {
      let app = existingApps[0];
      if (!app) {
        const [createdApp] = await db
          .insert(applications)
          .values({
            eventId: summitEvent.id,
            userId: demoParticipant.id,
            applicantName: demoParticipant.displayName,
            applicantEmail: demoParticipant.email,
            institution:
              demoParticipant.institution ||
              'Chandigarh University, Uttar Pradesh (Demo Account)',
            category: 'Innovator — Technical Showcase',
            statement:
              'Demonstrating connected event intelligence uniting organiser operations, participant experience, venue awareness, and context-bounded AI at Technovate 2026.',
            status: 'ACCEPTED',
            reviewedAt: new Date(),
            isDemoSeed: true,
          })
          .returning();
        app = createdApp;
      } else {
        const [updatedApp] = await db
          .update(applications)
          .set({
            status: 'ACCEPTED',
            reviewedAt: new Date(),
          })
          .where(
            and(
              eq(applications.id, app.id),
              eq(applications.isDemoSeed, true)
            )
          )
          .returning();
        app = updatedApp;
      }

      const existingCreds = await db
        .select()
        .from(credentials)
        .where(eq(credentials.applicationId, app.id));

      if (existingCreds.length === 0) {
        await db.insert(credentials).values({
          applicationId: app.id,
          eventId: summitEvent.id,
          userId: demoParticipant.id,
          participantCode: generateParticipantCode(app.id),
          verificationToken: 'auv_verify_' + generateOpaqueToken(18),
          roleCategory: app.category,
          status: 'ACTIVE',
        });
      } else {
        await db
          .update(credentials)
          .set({ status: 'ACTIVE' })
          .where(eq(credentials.id, existingCreds[0].id));
      }
    }

    return { ok: true, mode: input.mode };
  } catch (error) {
    console.error('Database query failed in resetGoldenPathDemoState:', error);
    throw new Error('Failed to reset showcase state.', { cause: error });
  }
}

export interface RouteComputationResult {
  reachable: boolean;
  steps: Array<{
    venueId: number;
    name: string;
    floor: string;
    poiType: string;
    instruction: string;
  }>;
  totalDistanceMeters: number;
  estimatedMinutes: number;
  summary: string;
}

export function computeVenueRoute(input: {
  venues: Array<{
    id: number;
    name: string;
    floor: string;
    zone: string;
    poiType?: string;
    operationalStatus?: string;
    accessible?: boolean;
  }>;
  edges: Array<{
    fromVenueId: number;
    toVenueId: number;
    distanceMeters: number;
    accessible: boolean;
    isCrossFloor: boolean;
  }>;
  fromVenueId: number;
  toVenueId: number;
  accessibleOnly?: boolean;
}): RouteComputationResult {
  const venueById = new Map(input.venues.map((v) => [v.id, v]));
  const start = venueById.get(input.fromVenueId);
  const target = venueById.get(input.toVenueId);

  if (!start || !target) {
    return {
      reachable: false,
      steps: [],
      totalDistanceMeters: 0,
      estimatedMinutes: 0,
      summary: 'Select both a starting location and a destination.',
    };
  }

  if (start.id === target.id) {
    return {
      reachable: true,
      steps: [
        {
          venueId: start.id,
          name: start.name,
          floor: start.floor,
          poiType: start.poiType || 'ROOM',
          instruction: `You are already at ${start.name} (${start.floor} · ${start.zone}).`,
        },
      ],
      totalDistanceMeters: 0,
      estimatedMinutes: 0,
      summary: `Already at ${start.name} (${start.floor}).`,
    };
  }

  const adj = new Map<
    number,
    Array<{ to: number; dist: number; accessible: boolean; isCrossFloor: boolean }>
  >();

  for (const edge of input.edges) {
    if (input.accessibleOnly && !edge.accessible) continue;
    const nodeA = venueById.get(edge.fromVenueId);
    const nodeB = venueById.get(edge.toVenueId);
    if (!nodeA || !nodeB) continue;

    // Skip closed intermediate connectors
    if (
      edge.fromVenueId !== start.id &&
      edge.fromVenueId !== target.id &&
      nodeA.operationalStatus &&
      nodeA.operationalStatus !== 'OPEN'
    ) {
      continue;
    }
    if (
      edge.toVenueId !== start.id &&
      edge.toVenueId !== target.id &&
      nodeB.operationalStatus &&
      nodeB.operationalStatus !== 'OPEN'
    ) {
      continue;
    }
    if (input.accessibleOnly) {
      if (nodeA.accessible === false || nodeB.accessible === false) continue;
    }

    if (!adj.has(edge.fromVenueId)) adj.set(edge.fromVenueId, []);
    if (!adj.has(edge.toVenueId)) adj.set(edge.toVenueId, []);
    adj.get(edge.fromVenueId)!.push({
      to: edge.toVenueId,
      dist: edge.distanceMeters,
      accessible: edge.accessible,
      isCrossFloor: edge.isCrossFloor,
    });
    adj.get(edge.toVenueId)!.push({
      to: edge.fromVenueId,
      dist: edge.distanceMeters,
      accessible: edge.accessible,
      isCrossFloor: edge.isCrossFloor,
    });
  }

  // Dijkstra
  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  const visited = new Set<number>();

  for (const v of input.venues) {
    dist.set(v.id, Infinity);
  }
  dist.set(start.id, 0);

  while (visited.size < input.venues.length) {
    let u: number | null = null;
    let best = Infinity;
    for (const [id, d] of dist.entries()) {
      if (!visited.has(id) && d < best) {
        best = d;
        u = id;
      }
    }
    if (u === null || best === Infinity) break;
    if (u === target.id) break;
    visited.add(u);

    const neighbors = adj.get(u) || [];
    for (const nb of neighbors) {
      if (visited.has(nb.to)) continue;
      const alt = best + nb.dist;
      if (alt < (dist.get(nb.to) ?? Infinity)) {
        dist.set(nb.to, alt);
        prev.set(nb.to, u);
      }
    }
  }

  const totalDist = dist.get(target.id) ?? Infinity;
  if (totalDist === Infinity) {
    // No connected path exists in the venue graph. Never invent guidance:
    // report truthfully so the UI can say the path hasn't been connected yet.
    return {
      reachable: false,
      steps: [],
      totalDistanceMeters: 0,
      estimatedMinutes: 0,
      summary: "Route unavailable. This path hasn't been connected yet.",
    };
  }

  const pathIds: number[] = [];
  let curr: number | undefined = target.id;
  while (curr !== undefined) {
    pathIds.unshift(curr);
    curr = prev.get(curr);
  }

  const steps = pathIds.map((vid, idx) => {
    const v = venueById.get(vid)!;
    const nextVid = pathIds[idx + 1];
    const nextV = nextVid ? venueById.get(nextVid) : null;
    let instruction = '';
    if (idx === 0) {
      instruction = `Start at ${v.name} (${v.floor} · ${v.zone})`;
    } else if (idx === pathIds.length - 1) {
      instruction = `Arrive at ${v.name} (${v.floor} · ${v.zone})`;
    } else if (
      v.poiType === 'LIFT' ||
      v.poiType === 'STAIRS' ||
      v.poiType === 'ESCALATOR' ||
      v.poiType === 'RAMP'
    ) {
      const destFloor = nextV ? nextV.floor : v.floor;
      instruction = `Take ${v.name} to ${destFloor}${
        v.accessible ? ' (Step-free)' : ''
      }`;
    } else {
      instruction = `Pass through ${v.name} (${v.floor} · ${v.zone})`;
    }

    return {
      venueId: v.id,
      name: v.name,
      floor: v.floor,
      poiType: v.poiType || 'ROOM',
      instruction,
    };
  });

  const estMin = Math.max(1, Math.round(totalDist / 55));

  return {
    reachable: true,
    steps,
    totalDistanceMeters: totalDist,
    estimatedMinutes: estMin,
    summary: steps.map((s) => s.instruction).join(' → '),
  };
}

export async function getUserJourneys(userId: number) {
  try {
    await ensureShowcaseDataSeeded();
    const allPublished = await getPublishedEvents(true);
    const eventById = new Map(allPublished.map((e) => [e.id, e]));

    const userApps = await db
      .select()
      .from(applications)
      .where(eq(applications.userId, userId))
      .orderBy(desc(applications.createdAt));

    const userCreds = await db
      .select()
      .from(credentials)
      .where(eq(credentials.userId, userId));
    const credByAppId = new Map(userCreds.map((c) => [c.applicationId, c]));

    const participating = [];
    for (const app of userApps) {
      const ev = eventById.get(app.eventId);
      if (!ev) continue;
      const evSessions = await db
        .select({
          id: sessions.id,
          eventId: sessions.eventId,
          venueId: sessions.venueId,
          title: sessions.title,
          description: sessions.description,
          speaker: sessions.speaker,
          startTime: sessions.startTime,
          endTime: sessions.endTime,
          dayLabel: sessions.dayLabel,
          track: sessions.track,
          status: sessions.status,
          lastUpdatedNote: sessions.lastUpdatedNote,
          updatedAt: sessions.updatedAt,
          venueName: venues.name,
          venueFloor: venues.floor,
          venueZone: venues.zone,
          venueMapX: venues.mapX,
          venueMapY: venues.mapY,
        })
        .from(sessions)
        .leftJoin(venues, eq(sessions.venueId, venues.id))
        .where(eq(sessions.eventId, ev.id))
        .orderBy(asc(sessions.startTime));

      const nextSession =
        evSessions.find((s) => s.status === 'UP_NEXT') ||
        evSessions.find((s) => s.status === 'HAPPENING_NOW') ||
        evSessions[0] ||
        null;

      participating.push({
        event: ev,
        application: app,
        credential: credByAppId.get(app.id) || null,
        nextSession,
      });
    }

    const orgRows = await db
      .select()
      .from(eventOrganisers)
      .where(eq(eventOrganisers.userId, userId));
    const orgEventIds = new Set(orgRows.map((r) => r.eventId));
    const organising = allPublished.filter((e) => orgEventIds.has(e.id));

    return {
      participating,
      organising,
    };
  } catch (error) {
    console.error('Database query failed in getUserJourneys:', error);
    throw new Error('Failed to load user journeys.', { cause: error });
  }
}

export async function createEventByUser(input: {
  userId: number;
  userEmail: string;
  title: string;
  subtitle: string;
  eventType: string;
  description: string;
  organisationName: string;
  organisationHq: string;
  location: string;
  datesLabel: string;
  startDate: string;
  endDate: string;
  timezone?: string;
  expectedParticipants?: number;
  visibility?: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
  applicationStatus?: 'COMING_SOON' | 'OPEN' | 'CLOSED';
  applicationConfig?: {
    requirePhone: boolean;
    customQuestionLabel: string;
    customQuestionRequired: boolean;
  };
  venueName?: string;
  venueAddress?: string;
  categories?: string[];
}) {
  try {
    const slugify = (v: string) =>
      v
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'event';

    // One transaction: either the whole event (+ organiser membership) exists
    // or nothing does. No orphan organisations on partial failure.
    return await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organisations)
        .values({
          slug: slugify(input.organisationName) + '-' + crypto.randomUUID().slice(0, 12),
          name: input.organisationName,
          description: `Host organisation for ${input.title}`,
          headquarters: input.organisationHq || input.location,
          isDemoSeed: false,
        })
        .returning();

      // Participant categories are DATA the organiser provides. A new event
      // starts with none; applicants then use a neutral "Participant" label.
      const categories = (input.categories ?? []).filter(Boolean);

      const [createdEvent] = await tx
        .insert(events)
        .values({
          slug: slugify(input.title) + '-' + crypto.randomUUID().slice(0, 12),
          organisationId: org.id,
          title: input.title,
          subtitle: input.subtitle,
          eventType: input.eventType,
          description: input.description,
          location: input.location,
          datesLabel: input.datesLabel,
          startDate: input.startDate,
          endDate: input.endDate,
          timezone: input.timezone || 'Asia/Kolkata',
          expectedParticipants: input.expectedParticipants || null,
          visibility: input.visibility || 'PUBLIC',
          applicationStatus: input.applicationStatus || 'OPEN',
          applicationConfig: JSON.stringify(
            input.applicationConfig || {
              requirePhone: false,
              customQuestionLabel: '',
              customQuestionRequired: false,
            }
          ),
          // Only what the organiser actually typed. Real venue structure is
          // built in Studio → Venue; nothing is invented here.
          venueName: input.venueName || null,
          venueAddress: input.venueAddress || null,
          venuePublished: true,
          status: 'LIVE',
          categories: JSON.stringify(categories),
          isDemoSeed: false,
        })
        .returning();

      await tx.insert(eventOrganisers).values({
        eventId: createdEvent.id,
        userId: input.userId,
        roleTitle: 'Lead Organiser',
      });

      await tx.insert(auditLogs).values({
        eventId: createdEvent.id,
        actorUserId: input.userId,
        actorEmail: input.userEmail,
        action: 'EVENT_CREATED',
        resourceType: 'EVENT',
        resourceId: String(createdEvent.id),
        details: `Created event "${createdEvent.title}" (${input.eventType}).`,
      });

      return createdEvent;
    });
  } catch (error) {
    console.error('Database query failed in createEventByUser:', error);
    throw new Error('Failed to create event.', { cause: error });
  }
}

export async function updateEventConfigByOrganiser(input: {
  eventId: number;
  title?: string;
  subtitle?: string;
  eventType?: string;
  description?: string;
  location?: string;
  datesLabel?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  expectedParticipants?: number;
  visibility?: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
  applicationStatus?: 'COMING_SOON' | 'OPEN' | 'CLOSED';
  applicationConfig?: {
    requirePhone: boolean;
    customQuestionLabel: string;
    customQuestionRequired: boolean;
  };
  venueName?: string;
  venueAddress?: string;
  venuePublished?: boolean;
  status?: string;
  categories?: string[];
  actorUserId: number;
  actorEmail: string;
}) {
  try {
    const updatePayload: Record<string, any> = {};
    if (input.title !== undefined) updatePayload.title = input.title;
    if (input.subtitle !== undefined) updatePayload.subtitle = input.subtitle;
    if (input.eventType !== undefined) updatePayload.eventType = input.eventType;
    if (input.startDate !== undefined) updatePayload.startDate = input.startDate;
    if (input.endDate !== undefined) updatePayload.endDate = input.endDate;
    if (input.description !== undefined)
      updatePayload.description = input.description;
    if (input.location !== undefined) updatePayload.location = input.location;
    if (input.datesLabel !== undefined)
      updatePayload.datesLabel = input.datesLabel;
    if (input.timezone !== undefined) updatePayload.timezone = input.timezone;
    if (input.expectedParticipants !== undefined)
      updatePayload.expectedParticipants = input.expectedParticipants;
    if (input.visibility !== undefined)
      updatePayload.visibility = input.visibility;
    if (input.applicationStatus !== undefined)
      updatePayload.applicationStatus = input.applicationStatus;
    if (input.applicationConfig !== undefined)
      updatePayload.applicationConfig = JSON.stringify(input.applicationConfig);
    if (input.venueName !== undefined) updatePayload.venueName = input.venueName;
    if (input.venueAddress !== undefined)
      updatePayload.venueAddress = input.venueAddress;
    if (input.venuePublished !== undefined)
      updatePayload.venuePublished = input.venuePublished;
    if (input.status !== undefined) updatePayload.status = input.status;
    if (input.categories !== undefined)
      updatePayload.categories = JSON.stringify(input.categories);

    const [updated] = await db
      .update(events)
      .set(updatePayload)
      .where(eq(events.id, input.eventId))
      .returning();

    await db.insert(auditLogs).values({
      eventId: input.eventId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      action: 'EVENT_CONFIG_UPDATED',
      resourceType: 'EVENT',
      resourceId: String(input.eventId),
      details: `Updated event configuration (${Object.keys(updatePayload).join(', ')}).`,
    });

    return updated;
  } catch (error) {
    console.error('Database query failed in updateEventConfigByOrganiser:', error);
    throw new Error('Failed to update event settings.', { cause: error });
  }
}
