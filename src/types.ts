export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  displayName: string;
  institution: string | null;
  activeRole: 'PARTICIPANT' | 'ORGANISER';
  isDemoSeed: boolean;
}

export interface ApplicationConfig {
  requirePhone: boolean;
  customQuestionLabel: string;
  customQuestionRequired: boolean;
}

export interface EventSummary {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  eventType?: string | null;
  description: string;
  location: string;
  datesLabel: string;
  startDate: string;
  endDate: string;
  timezone?: string;
  expectedParticipants?: number | null;
  visibility?: string;
  applicationStatus?: 'COMING_SOON' | 'OPEN' | 'CLOSED';
  applicationConfig?: ApplicationConfig;
  venueName?: string | null;
  venueAddress?: string | null;
  venuePublished?: boolean;
  status: string;
  categories: string[];
  isDemoSeed: boolean;
  organisationName: string;
  organisationSlug?: string;
  organisationHq: string;
  organisationDescription?: string;
}

export type PoiType =
  | 'ENTRANCE'
  | 'REGISTRATION'
  | 'HALL'
  | 'ROOM'
  | 'STAGE'
  | 'HELP_DESK'
  | 'FOOD'
  | 'CAFE'
  | 'WATER'
  | 'REST_AREA'
  | 'WASHROOM'
  | 'MEDICAL'
  | 'STAIRS'
  | 'LIFT'
  | 'ESCALATOR'
  | 'RAMP'
  | 'EMERGENCY_EXIT'
  | 'ASSEMBLY_POINT'
  | 'CUSTOM';

export type PoiCategory = 'EVENT' | 'AMENITY' | 'MOVEMENT' | 'SAFETY' | 'OTHER';

export type OperationalStatus = 'OPEN' | 'CLOSED' | 'TEMPORARILY_UNAVAILABLE';

export interface VenueFloor {
  id: number;
  eventId: number;
  name: string;
  levelOrder: number;
  description: string | null;
  recordedPath: Array<{ x: number; y: number }>;
  recordedDistanceMeters: number;
}

export interface VenueLocation {
  id: number;
  eventId: number;
  floorId?: number | null;
  name: string;
  shortDescription: string;
  floor: string;
  zone: string;
  poiType: PoiType;
  poiCategory: PoiCategory;
  operationalStatus: OperationalStatus;
  accessible: boolean;
  connectedFloors: string[];
  mapX: number;
  mapY: number;
  waypointToken: string;
  capacity: number | null;
}

export interface VenueEdge {
  id: number;
  eventId: number;
  fromVenueId: number;
  toVenueId: number;
  distanceMeters: number;
  accessible: boolean;
  isCrossFloor: boolean;
}

export interface ComputedRouteStep {
  venueId: number;
  name: string;
  floor: string;
  poiType: PoiType;
  instruction: string;
}

export interface EventSession {
  id: number;
  eventId: number;
  venueId: number | null;
  title: string;
  description: string;
  speaker: string | null;
  startTime: string;
  endTime: string;
  dayLabel: string;
  track: string;
  status: 'COMPLETED' | 'HAPPENING_NOW' | 'UP_NEXT' | 'UPCOMING';
  lastUpdatedNote: string | null;
  updatedAt: string | null;
  venueName: string | null;
  venueFloor: string | null;
  venueZone: string | null;
  venueMapX: number | null;
  venueMapY: number | null;
  venueOperationalStatus?: OperationalStatus;
}

export interface EventAnnouncement {
  id: number;
  eventId: number;
  authorUserId: number | null;
  title: string;
  body: string;
  announcementType?: string;
  attachedVenueId?: number | null;
  attachedVenueName?: string | null;
  attachedSessionId?: number | null;
  attachedSessionTitle?: string | null;
  audience: 'ALL_APPLICANTS' | 'ACCEPTED_ONLY' | 'ORGANISERS_ONLY';
  priority: 'STANDARD' | 'IMPORTANT' | 'URGENT';
  publishedAt: string | null;
}

export interface EventResource {
  id: number;
  eventId: number;
  title: string;
  description: string;
  url: string;
  category: string;
  audience: 'ALL_APPLICANTS' | 'ACCEPTED_ONLY';
}

export interface ParticipantApplication {
  id: number;
  eventId: number;
  userId: number;
  applicantName: string;
  applicantEmail: string;
  phone?: string | null;
  institution: string;
  category: string;
  statement: string;
  customAnswer?: string | null;
  status: 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED';
  reviewedAt: string | null;
  createdAt: string | null;
  isDemoSeed?: boolean;
  credential?: DigitalCredential | null;
}

export interface DigitalCredential {
  id: number;
  applicationId: number;
  eventId: number;
  userId: number;
  participantCode: string;
  verificationToken: string;
  roleCategory: string;
  status: 'ACTIVE' | 'REVOKED';
  issuedAt: string | null;
}

export interface WaypointScanEntry {
  id: number;
  venueId: number;
  venueName: string;
  venueFloor: string;
  venueZone: string;
  scannedAt: string | null;
}

export interface EventPulseData {
  serverTimestamp: string;
  happeningNow: EventSession | null;
  upNext: EventSession | null;
  latestUpdate: EventAnnouncement | null;
  nextDestination: VenueLocation | null;
}

export interface EventFullContext {
  event: EventSummary;
  floors: VenueFloor[];
  venues: VenueLocation[];
  edges: VenueEdge[];
  sessions: EventSession[];
  announcements: EventAnnouncement[];
  resources: EventResource[];
  myApplication: ParticipantApplication | null;
  myCredential: DigitalCredential | null;
  isOrganiser: boolean;
  waypointTrail: WaypointScanEntry[];
  pulse: EventPulseData;
}

export interface AuditLogEntry {
  id: number;
  eventId: number | null;
  actorUserId: number | null;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: string | null;
  createdAt: string | null;
}

export interface UserJourneysData {
  participating: Array<{
    event: EventSummary;
    application: ParticipantApplication;
    credential: DigitalCredential | null;
    nextSession: EventSession | null;
  }>;
  organising: EventSummary[];
}
