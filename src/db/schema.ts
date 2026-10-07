import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  institution: text('institution'),
  activeRole: text('active_role').notNull().default('PARTICIPANT'), // Contextual fallback
  isDemoSeed: boolean('is_demo_seed').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const organisations = pgTable('organisations', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  headquarters: text('headquarters').notNull(),
  isDemoSeed: boolean('is_demo_seed').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const events = pgTable(
  'events',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    organisationId: integer('organisation_id')
      .references(() => organisations.id)
      .notNull(),
    title: text('title').notNull(),
    subtitle: text('subtitle').notNull(),
    // Structured event type/category (free-form DATA, e.g. 'Hackathon', 'Custom').
    // Nullable so pre-existing rows keep working; apply with `drizzle-kit push`.
    eventType: text('event_type'),
    description: text('description').notNull(),
    location: text('location').notNull(),
    datesLabel: text('dates_label').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    timezone: text('timezone').notNull().default('Asia/Kolkata'),
    expectedParticipants: integer('expected_participants').default(300),
    visibility: text('visibility').notNull().default('PUBLIC'), // 'PUBLIC' | 'UNLISTED' | 'PRIVATE'
    applicationStatus: text('application_status').notNull().default('OPEN'), // 'COMING_SOON' | 'OPEN' | 'CLOSED'
    applicationConfig: text('application_config'), // JSON string of configurable application schema
    venueName: text('venue_name'),
    venueAddress: text('venue_address'),
    venuePublished: boolean('venue_published').notNull().default(true),
    status: text('status').notNull().default('LIVE'), // 'DRAFT' | 'PUBLISHED' | 'LIVE' | 'ARCHIVED' | 'ISOLATION_FIXTURE'
    categories: text('categories').notNull(), // JSON array of strings
    isDemoSeed: boolean('is_demo_seed').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [index('events_status_idx').on(table.status)]
);

export const eventOrganisers = pgTable(
  'event_organisers',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .references(() => events.id)
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    roleTitle: text('role_title').notNull().default('Lead Organiser'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    uniqueIndex('event_organisers_event_user_unique').on(
      table.eventId,
      table.userId
    ),
    index('event_organisers_event_id_idx').on(table.eventId),
    index('event_organisers_user_id_idx').on(table.userId),
  ]
);

export const venueFloors = pgTable(
  'venue_floors',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .references(() => events.id)
      .notNull(),
    name: text('name').notNull(),
    levelOrder: integer('level_order').notNull().default(0),
    description: text('description'),
    recordedPathJson: text('recorded_path_json'), // JSON array of {x, y} points
    recordedDistanceMeters: integer('recorded_distance_meters').default(0),
    isDemoSeed: boolean('is_demo_seed').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [index('venue_floors_event_id_idx').on(table.eventId)]
);

export const venues = pgTable(
  'venues',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .references(() => events.id)
      .notNull(),
    floorId: integer('floor_id').references(() => venueFloors.id),
    name: text('name').notNull(),
    shortDescription: text('short_description').notNull(),
    floor: text('floor').notNull(),
    zone: text('zone').notNull(),
    poiType: text('poi_type').notNull().default('ROOM'), // 'ENTRANCE' | 'REGISTRATION' | 'HALL' | 'ROOM' | 'STAGE' | 'HELP_DESK' | 'FOOD' | 'CAFE' | 'WATER' | 'REST_AREA' | 'WASHROOM' | 'MEDICAL' | 'STAIRS' | 'LIFT' | 'ESCALATOR' | 'RAMP' | 'EMERGENCY_EXIT' | 'ASSEMBLY_POINT' | 'CUSTOM'
    poiCategory: text('poi_category').notNull().default('EVENT'), // 'EVENT' | 'AMENITY' | 'MOVEMENT' | 'SAFETY' | 'OTHER'
    operationalStatus: text('operational_status').notNull().default('OPEN'), // 'OPEN' | 'CLOSED' | 'TEMPORARILY_UNAVAILABLE'
    accessible: boolean('accessible').notNull().default(true),
    connectedFloorNames: text('connected_floor_names'), // JSON array of floor names for connectors
    mapX: integer('map_x').notNull(),
    mapY: integer('map_y').notNull(),
    waypointToken: text('waypoint_token').notNull().unique(),
    capacity: integer('capacity'),
    isDemoSeed: boolean('is_demo_seed').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [index('venues_event_id_idx').on(table.eventId)]
);

export const venueEdges = pgTable(
  'venue_edges',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .references(() => events.id)
      .notNull(),
    fromVenueId: integer('from_venue_id')
      .references(() => venues.id)
      .notNull(),
    toVenueId: integer('to_venue_id')
      .references(() => venues.id)
      .notNull(),
    distanceMeters: integer('distance_meters').notNull().default(25),
    accessible: boolean('accessible').notNull().default(true),
    isCrossFloor: boolean('is_cross_floor').notNull().default(false),
    isDemoSeed: boolean('is_demo_seed').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [index('venue_edges_event_id_idx').on(table.eventId)]
);

export const sessions = pgTable(
  'sessions',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .references(() => events.id)
      .notNull(),
    // Nullable: a session may exist before the organiser has built a venue.
    venueId: integer('venue_id').references(() => venues.id),
    title: text('title').notNull(),
    description: text('description').notNull(),
    speaker: text('speaker'),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    dayLabel: text('day_label').notNull(),
    track: text('track').notNull().default('General'),
    status: text('status').notNull().default('UPCOMING'), // 'COMPLETED' | 'HAPPENING_NOW' | 'UP_NEXT' | 'UPCOMING'
    lastUpdatedNote: text('last_updated_note'),
    updatedAt: timestamp('updated_at').defaultNow(),
    isDemoSeed: boolean('is_demo_seed').notNull().default(false),
  },
  (table) => [
    index('sessions_event_id_idx').on(table.eventId),
    index('sessions_start_time_idx').on(table.startTime),
    index('sessions_status_idx').on(table.status),
  ]
);

export const applications = pgTable(
  'applications',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .references(() => events.id)
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    applicantName: text('applicant_name').notNull(),
    applicantEmail: text('applicant_email').notNull(),
    phone: text('phone'),
    institution: text('institution').notNull(),
    category: text('category').notNull(),
    statement: text('statement').notNull(),
    customAnswer: text('custom_answer'),
    status: text('status').notNull().default('UNDER_REVIEW'), // 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED'
    reviewedByUserId: integer('reviewed_by_user_id').references(() => users.id),
    reviewedAt: timestamp('reviewed_at'),
    isDemoSeed: boolean('is_demo_seed').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    uniqueIndex('applications_event_user_unique').on(
      table.eventId,
      table.userId
    ),
    index('applications_event_id_idx').on(table.eventId),
    index('applications_user_id_idx').on(table.userId),
    index('applications_status_idx').on(table.status),
  ]
);

export const credentials = pgTable(
  'credentials',
  {
    id: serial('id').primaryKey(),
    applicationId: integer('application_id')
      .references(() => applications.id)
      .notNull()
      .unique(),
    eventId: integer('event_id')
      .references(() => events.id)
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    participantCode: text('participant_code').notNull().unique(),
    verificationToken: text('verification_token').notNull().unique(),
    roleCategory: text('role_category').notNull(),
    status: text('status').notNull().default('ACTIVE'), // 'ACTIVE' | 'REVOKED'
    issuedAt: timestamp('issued_at').defaultNow(),
  },
  (table) => [
    index('credentials_event_id_idx').on(table.eventId),
    index('credentials_user_id_idx').on(table.userId),
    index('credentials_status_idx').on(table.status),
  ]
);

export const announcements = pgTable(
  'announcements',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .references(() => events.id)
      .notNull(),
    authorUserId: integer('author_user_id').references(() => users.id),
    title: text('title').notNull(),
    body: text('body').notNull(),
    announcementType: text('announcement_type').notNull().default('GENERAL'), // 'GENERAL' | 'SCHEDULE' | 'VENUE' | 'LOCATION' | 'FOOD' | 'TRANSPORT' | 'SAFETY' | 'REGISTRATION' | 'PROGRAMME'
    attachedVenueId: integer('attached_venue_id').references(() => venues.id),
    attachedSessionId: integer('attached_session_id').references(
      () => sessions.id
    ),
    audience: text('audience').notNull().default('ACCEPTED_ONLY'), // 'ALL_APPLICANTS' | 'ACCEPTED_ONLY' | 'ORGANISERS_ONLY'
    priority: text('priority').notNull().default('STANDARD'), // 'STANDARD' | 'IMPORTANT' | 'URGENT'
    isDemoSeed: boolean('is_demo_seed').notNull().default(false),
    publishedAt: timestamp('published_at').defaultNow(),
  },
  (table) => [
    index('announcements_event_id_idx').on(table.eventId),
    index('announcements_published_at_idx').on(table.publishedAt),
  ]
);

export const resources = pgTable(
  'resources',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .references(() => events.id)
      .notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    url: text('url').notNull(),
    category: text('category').notNull().default('Briefing Dossier'),
    audience: text('audience').notNull().default('ACCEPTED_ONLY'), // 'ALL_APPLICANTS' | 'ACCEPTED_ONLY'
    isDemoSeed: boolean('is_demo_seed').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [index('resources_event_id_idx').on(table.eventId)]
);

export const waypointScans = pgTable(
  'waypoint_scans',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .references(() => events.id)
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    venueId: integer('venue_id')
      .references(() => venues.id)
      .notNull(),
    scannedAt: timestamp('scanned_at').defaultNow(),
  },
  (table) => [
    index('waypoint_scans_event_id_idx').on(table.eventId),
    index('waypoint_scans_user_id_idx').on(table.userId),
  ]
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id').references(() => events.id),
    actorUserId: integer('actor_user_id').references(() => users.id),
    actorEmail: text('actor_email').notNull(),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    details: text('details'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [index('audit_logs_event_id_idx').on(table.eventId)]
);

export const usersRelations = relations(users, ({ many }) => ({
  applications: many(applications),
  credentials: many(credentials),
  organiserMemberships: many(eventOrganisers),
  waypointScans: many(waypointScans),
}));

export const organisationsRelations = relations(organisations, ({ many }) => ({
  events: many(events),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [events.organisationId],
    references: [organisations.id],
  }),
  floors: many(venueFloors),
  venues: many(venues),
  edges: many(venueEdges),
  sessions: many(sessions),
  applications: many(applications),
  announcements: many(announcements),
  resources: many(resources),
  organisers: many(eventOrganisers),
}));

export const venuesRelations = relations(venues, ({ one, many }) => ({
  event: one(events, {
    fields: [venues.eventId],
    references: [events.id],
  }),
  sessions: many(sessions),
  waypointScans: many(waypointScans),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  event: one(events, {
    fields: [sessions.eventId],
    references: [events.id],
  }),
  venue: one(venues, {
    fields: [sessions.venueId],
    references: [venues.id],
  }),
}));

export const applicationsRelations = relations(applications, ({ one }) => ({
  event: one(events, {
    fields: [applications.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [applications.userId],
    references: [users.id],
  }),
  credential: one(credentials, {
    fields: [applications.id],
    references: [credentials.applicationId],
  }),
}));
