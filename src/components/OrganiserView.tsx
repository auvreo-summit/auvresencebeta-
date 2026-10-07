import { SessionComposer, StudioSettings, AutomationsPrototype } from './StudioTools.tsx';
import { useDialogFocus } from '../hooks/useDialogFocus.ts';
import { PoiIcon } from './PoiIcon.tsx';
import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowRight,
  Check,
  ExternalLink,
  ArrowUpRight,
  X,
} from 'lucide-react';
import type {
  AuditLogEntry,
  EventFullContext,
  EventSession,
  ParticipantApplication,
  UserProfile,
} from '../types.ts';
import type { ActionArchitectureTrace } from './ActionXRayModal.tsx';

export type OrganiserTab =
  | 'SETTINGS'
  | 'AUTOMATIONS'
  | 'CREDENTIALS'
  | 'OVERVIEW'
  | 'APPLICATIONS'
  | 'SCHEDULE'
  | 'LIVE'
  | 'ANNOUNCEMENTS'
  | 'PARTICIPANTS'
  | 'VENUES'
  | 'RESOURCES';

interface OrganiserDashboardResponse {
  stats: {
    totalApplications: number;
    underReview: number;
    accepted?: number;
    acceptedParticipants?: number;
    rejected: number;
    activeCredentials: number;
    revokedCredentials?: number;
    waypointScansCount?: number;
  };
  applications: ParticipantApplication[];
  auditLogs: AuditLogEntry[];
}

interface OrganiserViewProps {
  user: UserProfile | null;
  authToken: string | null;
  authMode?: 'PARTICIPANT_A' | 'ORGANISER_B' | 'FIREBASE';
  context: EventFullContext | null;
  onRefreshContext: () => Promise<void>;
  onSwitchToOrganiserAccount?: () => Promise<void>;
  onSwitchToParticipantAccount: () => void;
  onOpenVerificationPreview: (token: string) => void;
  onOpenAskAuvresence?: (question?: string) => void;
  externalActiveTab?: OrganiserTab;
  onTabChange?: (tab: OrganiserTab) => void;
  onRecordActionTrace?: (trace: ActionArchitectureTrace) => void;
  onOpenLastXRay?: () => void;
  initialDraft?: {
    title: string;
    expectedParticipants: string;
    type: string;
  } | null;
}

export const OrganiserView: React.FC<OrganiserViewProps> = ({
  user,
  authToken,
  context,
  onRefreshContext,
  onSwitchToParticipantAccount,
  onOpenVerificationPreview,
  onOpenAskAuvresence,
  externalActiveTab,
  onTabChange,
  onRecordActionTrace,
  initialDraft,
}) => {
  const [activeTab, setActiveTab] = useState<OrganiserTab>(
    externalActiveTab || 'OVERVIEW'
  );

  useEffect(() => {
    if (externalActiveTab) {
      setActiveTab(externalActiveTab);
    }
  }, [externalActiveTab]);

  const handleSelectTab = (tab: OrganiserTab) => {
    setActiveTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  const [dashboard, setDashboard] = useState<OrganiserDashboardResponse | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<{
    title: string;
    detail?: string;
  } | null>(null);

  // Application Side Sheet state
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [appFilter, setAppFilter] = useState<
    'ALL' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED'
  >('ALL');
  const [updatingAppId, setUpdatingAppId] = useState<number | null>(null);

  const appSheetRef = useDialogFocus(Boolean(selectedAppId && context?.isOrganiser), () => setSelectedAppId(null));

  // Session Side Sheet state
  const [selectedSession, setSelectedSession] = useState<EventSession | null>(
    null
  );
  const sessionSheetRef = useDialogFocus<HTMLFormElement>(Boolean(selectedSession && context?.isOrganiser), () => setSelectedSession(null));
  const [targetVenueId, setTargetVenueId] = useState<number | null>(null);
  const [targetStartTime, setTargetStartTime] = useState<string>('');
  const [targetEndTime, setTargetEndTime] = useState<string>('');
  const [targetStatus, setTargetStatus] = useState<
    'COMPLETED' | 'HAPPENING_NOW' | 'UP_NEXT' | 'UPCOMING'
  >('UP_NEXT');
  const [updatingSession, setUpdatingSession] = useState(false);

  // Announcement Composer state
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annType, setAnnType] = useState<string>('GENERAL');
  const [annPriority, setAnnPriority] = useState<
    'STANDARD' | 'IMPORTANT' | 'URGENT'
  >('IMPORTANT');
  const [annAttachedVenueId, setAnnAttachedVenueId] = useState<string>('');
  const [annAudience, setAnnAudience] = useState<
    'ALL_APPLICANTS' | 'ACCEPTED_ONLY' | 'ORGANISERS_ONLY'
  >('ALL_APPLICANTS');
  const [publishingAnn, setPublishingAnn] = useState(false);

  // Venue Studio & Draw-to-Map state
  const [studioFloorName, setStudioFloorName] = useState<string>('');
  const [isRecordingPath, setIsRecordingPath] = useState<boolean>(false);
  const [recordedPoints, setRecordedPoints] = useState<
    Array<{ x: number; y: number }>
  >([]);
  const [savingFloorPath, setSavingFloorPath] = useState<boolean>(false);

  const [newPoiName, setNewPoiName] = useState<string>('');
  const [newPoiZone, setNewPoiZone] = useState<string>('');
  const [newFloorName, setNewFloorName] = useState<string>('');
  const [addingFloor, setAddingFloor] = useState<boolean>(false);
  const [newPoiDesc, setNewPoiDesc] = useState<string>('');
  const [newPoiType, setNewPoiType] = useState<string>('ROOM');
  const [newPoiCategory, setNewPoiCategory] = useState<string>('EVENT');
  const [newPoiAccessible, setNewPoiAccessible] = useState<boolean>(true);
  const [newPoiX, setNewPoiX] = useState<number>(50);
  const [newPoiY, setNewPoiY] = useState<number>(50);
  const [creatingPoi, setCreatingPoi] = useState<boolean>(false);

  const [edgeFromId, setEdgeFromId] = useState<number>(0);
  const [edgeToId, setEdgeToId] = useState<number>(0);
  const [edgeDist, setEdgeDist] = useState<number>(25);
  const [edgeAccessible, setEdgeAccessible] = useState<boolean>(true);
  const [creatingEdge, setCreatingEdge] = useState<boolean>(false);

  const eventId = context?.event.id ?? 0;

  // Keep the selected floor pointing at a floor that actually exists.
  useEffect(() => {
    const floors = context?.floors || [];
    if (floors.length === 0) {
      if (studioFloorName) setStudioFloorName('');
      return;
    }
    if (!floors.some((f) => f.name === studioFloorName)) {
      const first = [...floors].sort((a, b) => a.levelOrder - b.levelOrder)[0];
      setStudioFloorName(first.name);
      setRecordedPoints(first.recordedPath || []);
    }
  }, [context?.floors, studioFloorName]);

  const fetchDashboard = useCallback(async () => {
    if (!authToken || !eventId) return;
    setLoading(true);
    setErrorBanner(null);

    try {
      const res = await fetch(`/api/organiser/events/${eventId}/dashboard`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorBanner(
          json.error || 'Organiser permissions required to access Studio.'
        );
        setDashboard(null);
      } else {
        setDashboard(json);
      }
    } catch {
      setErrorBanner('Could not load Studio state.');
    } finally {
      setLoading(false);
    }
  }, [authToken, eventId]);

  useEffect(() => {
    if (context?.isOrganiser) {
      fetchDashboard();
    } else {
      setDashboard(null);
    }
  }, [context?.isOrganiser, fetchDashboard]);

  // Keep selectedSession synced with context updates
  const openSessionSheet = (s: EventSession) => {
    setSelectedSession(s);
    setTargetVenueId(s.venueId);
    setTargetStartTime(s.startTime);
    setTargetEndTime(s.endTime);
    setTargetStatus(s.status);
  };

  const [updatingCredential, setUpdatingCredential] = useState<number | null>(null);
  const handleCredentialStatus = async (id: number, status: 'ACTIVE' | 'REVOKED') => {
    if (!authToken || updatingCredential) return;
    setUpdatingCredential(id); setErrorBanner(null);
    try {
      const response = await fetch(`/api/organiser/credentials/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ status }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Credential could not be updated.');
      await Promise.all([fetchDashboard(), onRefreshContext()]);
      setStatusNotice({ title: status === 'ACTIVE' ? 'Credential reactivated' : 'Credential revoked' });
    } catch (error: any) { setErrorBanner(error.message); } finally { setUpdatingCredential(null); }
  };

  // Review Application (Accept / Reject)
  const handleReviewApplication = async (
    applicationId: number,
    status: 'ACCEPTED' | 'REJECTED' | 'UNDER_REVIEW'
  ) => {
    if (!authToken) return;
    setUpdatingAppId(applicationId);
    setErrorBanner(null);

    try {
      const res = await fetch(
        `/api/organiser/applications/${applicationId}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ status }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Could not update application.');
      }

      await fetchDashboard();
      await onRefreshContext();

      const targetApp = dashboard?.applications.find(
        (a) => a.id === applicationId
      );
      setStatusNotice({
        title:
          status === 'ACCEPTED'
            ? 'APPLICATION ACCEPTED'
            : `STATUS UPDATED · ${status}`,
        detail:
          status === 'ACCEPTED'
            ? `${targetApp?.applicantName || 'Participant'} → ACCEPTED · Credential active`
            : `${targetApp?.applicantName || 'Participant'} → ${status}`,
      });

      if (onRecordActionTrace) {
        onRecordActionTrace({
          id: `review-app-${Date.now()}`,
          title: `Application #${applicationId} → ${status}`,
          subtitle:
            status === 'ACCEPTED'
              ? 'Participant accepted & QR credential activated'
              : `Status updated to ${status}`,
          timestamp: new Date().toLocaleTimeString(),
          steps: [
            {
              layer: 'ORGANISER ACTION',
              detail: `PATCH /api/organiser/applications/${applicationId}/status ({ status: "${status}" })`,
            },
            {
              layer: 'AUTHORIZATION & ISOLATION',
              detail: `Verified organiser authority for event #${eventId}.`,
            },
            {
              layer: 'DATABASE TRANSACTION',
              detail:
                status === 'ACCEPTED'
                  ? `Updated application to ACCEPTED and activated credential in PostgreSQL.`
                  : `Updated application status to ${status}.`,
            },
            {
              layer: 'CONNECTED SURFACES',
              detail: `Participant Space and public QR verification updated immediately.`,
            },
          ],
        });
      }
    } catch (err: any) {
      setErrorBanner(err.message || 'Could not update application.');
    } finally {
      setUpdatingAppId(null);
    }
  };

  // Update Session Location / Time from Side Sheet
  const handleSaveSessionSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken || !selectedSession || !context) return;

    const oldVenueName = selectedSession.venueName;
    const newVenue = context.venues.find((v) => v.id === targetVenueId);
    const newVenueName = newVenue?.name || oldVenueName || 'No destination';
    if (!targetStartTime || !targetEndTime || targetEndTime <= targetStartTime) {
      setErrorBanner('Set a valid start and end time first.');
      return;
    }

    setUpdatingSession(true);
    setErrorBanner(null);

    try {
      const res = await fetch(
        `/api/organiser/events/${eventId}/sessions/${selectedSession.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            title: selectedSession.title,
            description: selectedSession.description,
            speaker: selectedSession.speaker || '',
            startTime: targetStartTime,
            endTime: targetEndTime,
            venueId: targetVenueId,
            status: targetStatus,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Couldn't update venue.");
      }

      await onRefreshContext();
      await fetchDashboard();

      setSelectedSession(null);
      setStatusNotice({
        title:
          (oldVenueName || '') !== newVenueName ? 'VENUE UPDATED' : 'SESSION UPDATED',
        detail:
          (oldVenueName || '') !== newVenueName
            ? `${(oldVenueName || 'No destination').toUpperCase()} → ${newVenueName.toUpperCase()}`
            : `${selectedSession.title} (${targetStartTime})`,
      });

      if (onRecordActionTrace) {
        onRecordActionTrace({
          id: `session-update-${Date.now()}`,
          title: `Session Updated · ${selectedSession.title}`,
          subtitle: `${oldVenueName || 'No destination'} → ${newVenueName}`,
          timestamp: new Date().toLocaleTimeString(),
          steps: [
            {
              layer: 'ORGANISER STUDIO',
              detail: `PUT /api/organiser/events/${eventId}/sessions/${selectedSession.id}`,
            },
            {
              layer: 'SERVER AUTHORIZATION',
              detail: `Verified organiser authority and validated venue #${targetVenueId}.`,
            },
            {
              layer: 'DATABASE UPDATE',
              detail: `Updated session venue to ${newVenueName}.`,
            },
            {
              layer: 'CONNECTED PROPAGATION',
              detail: `Participant Today, My Day, Venue, and Ask Auvresence now reflect ${newVenueName}.`,
            },
          ],
        });
      }
    } catch {
      setErrorBanner("Couldn't update venue. Nothing was changed.");
    } finally {
      setUpdatingSession(false);
    }
  };


  // Publish Update (Announcement)
  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken || !annTitle.trim() || !annBody.trim()) return;
    setPublishingAnn(true);
    setErrorBanner(null);

    try {
      const res = await fetch(
        `/api/organiser/events/${eventId}/announcements`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            title: annTitle,
            body: annBody,
            announcementType: annType,
            attachedVenueId: annAttachedVenueId
              ? Number(annAttachedVenueId)
              : null,
            audience: annAudience,
            priority: annPriority,
          }),
        }
      );
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Could not publish update.');
      }

      const publishedTitle = annTitle;
      setAnnTitle('');
      setAnnBody('');
      setAnnAttachedVenueId('');
      await onRefreshContext();
      await fetchDashboard();

      setStatusNotice({
        title: 'UPDATE PUBLISHED',
        detail: publishedTitle,
      });
    } catch (err: any) {
      setErrorBanner(err.message || 'Could not publish update.');
    } finally {
      setPublishingAnn(false);
    }
  };

  // Save Draw-to-Map recorded corridor path
  const handleSaveFloorPath = async () => {
    if (!authToken || !context) return;
    const floorObj = (context.floors || []).find(
      (f) => f.name === studioFloorName
    );
    if (!floorObj) return;
    setSavingFloorPath(true);
    setErrorBanner(null);
    try {
      let totalMeters = 0;
      for (let i = 1; i < recordedPoints.length; i++) {
        const dx = recordedPoints[i].x - recordedPoints[i - 1].x;
        const dy = recordedPoints[i].y - recordedPoints[i - 1].y;
        totalMeters += Math.round(Math.hypot(dx, dy) * 1.8);
      }
      const res = await fetch(
        `/api/organiser/events/${eventId}/floors/${floorObj.id}/path`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            recordedPath: recordedPoints,
            recordedDistanceMeters: totalMeters,
          }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Could not save floor corridor path.');
      await onRefreshContext();
      setIsRecordingPath(false);
      setStatusNotice({
        title: 'FLOOR PATH SAVED',
        detail: `${studioFloorName} (${recordedPoints.length} waypoints · ~${totalMeters}m)`,
      });
    } catch (err: any) {
      setErrorBanner(err.message || 'Could not save floor path.');
    } finally {
      setSavingFloorPath(false);
    }
  };

  // Create an organiser-named floor (no assumed floors exist)
  const handleCreateFloor = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newFloorName.trim();
    if (!authToken || name.length < 2) return;
    if (
      (context?.floors || []).some(
        (f) => f.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      setErrorBanner('A floor with that name already exists.');
      return;
    }
    setAddingFloor(true);
    setErrorBanner(null);
    try {
      const nextOrder =
        (context?.floors || []).reduce(
          (m, f) => Math.max(m, f.levelOrder),
          -1
        ) + 1;
      const res = await fetch(`/api/organiser/events/${eventId}/floors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ name, levelOrder: nextOrder }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Could not add the floor.');
      await onRefreshContext();
      setStudioFloorName(name);
      setRecordedPoints([]);
      setNewFloorName('');
      setStatusNotice({ title: 'FLOOR ADDED', detail: name });
    } catch (err: any) {
      setErrorBanner(err.message || 'Could not add the floor.');
    } finally {
      setAddingFloor(false);
    }
  };

  // Create new Venue POI
  const handleCreatePoi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken || !newPoiName.trim()) return;
    setCreatingPoi(true);
    setErrorBanner(null);
    try {
      const floorObj = (context?.floors || []).find(
        (f) => f.name === studioFloorName
      );
      const res = await fetch(`/api/organiser/events/${eventId}/venues`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          floorId: floorObj?.id || null,
          name: newPoiName.trim(),
          shortDescription:
            newPoiDesc.trim() ||
            `${newPoiType.replace('_', ' ')} on ${studioFloorName}${newPoiZone.trim() ? ` (${newPoiZone.trim()})` : ''}`,
          floor: studioFloorName,
          zone: newPoiZone.trim() || studioFloorName,
          poiType: newPoiType,
          poiCategory: newPoiCategory,
          operationalStatus: 'OPEN',
          accessible: newPoiAccessible,
          mapX: newPoiX,
          mapY: newPoiY,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Could not add venue location.');
      const createdName = newPoiName.trim();
      setNewPoiName('');
      setNewPoiDesc('');
      await onRefreshContext();
      setStatusNotice({
        title: 'LOCATION ADDED',
        detail: `${createdName} (${studioFloorName})`,
      });
    } catch (err: any) {
      setErrorBanner(err.message || 'Could not add venue location.');
    } finally {
      setCreatingPoi(false);
    }
  };

  // Toggle Venue Operational Status (OPEN <-> TEMPORARILY_UNAVAILABLE)
  const handleToggleVenueStatus = async (v: EventFullContext['venues'][0]) => {
    if (!authToken) return;
    const nextStatus =
      v.operationalStatus === 'OPEN' ? 'TEMPORARILY_UNAVAILABLE' : 'OPEN';
    try {
      const res = await fetch(
        `/api/organiser/events/${eventId}/venues/${v.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            name: v.name,
            shortDescription: v.shortDescription,
            floor: v.floor,
            zone: v.zone,
            poiType: v.poiType,
            poiCategory: v.poiCategory,
            operationalStatus: nextStatus,
            accessible: v.accessible,
            connectedFloors: v.connectedFloors,
            mapX: v.mapX,
            mapY: v.mapY,
            capacity: v.capacity,
          }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Could not update venue status.');
      await onRefreshContext();
      setStatusNotice({
        title: 'LOCATION STATUS UPDATED',
        detail: `${v.name} → ${nextStatus.replace('_', ' ')}`,
      });
    } catch (err: any) {
      setErrorBanner(err.message || 'Could not update venue status.');
    }
  };

  // Connect two POIs with a pathway edge
  const handleCreateEdge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken || !edgeFromId || !edgeToId || edgeFromId === edgeToId)
      return;
    setCreatingEdge(true);
    setErrorBanner(null);
    try {
      const fromV = context?.venues.find((v) => v.id === edgeFromId);
      const toV = context?.venues.find((v) => v.id === edgeToId);
      const isCross = Boolean(fromV && toV && fromV.floor !== toV.floor);
      const res = await fetch(`/api/organiser/events/${eventId}/edges`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          fromVenueId: edgeFromId,
          toVenueId: edgeToId,
          distanceMeters: edgeDist,
          accessible: edgeAccessible,
          isCrossFloor: isCross,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Could not connect locations.');
      await onRefreshContext();
      setStatusNotice({
        title: 'PATHWAY CONNECTED',
        detail: `${fromV?.name || 'Location'} ↔ ${toV?.name || 'Location'} (${edgeDist}m)`,
      });
    } catch (err: any) {
      setErrorBanner(err.message || 'Could not connect locations.');
    } finally {
      setCreatingEdge(false);
    }
  };

  // Studio authority comes from organiser membership of THIS event — never
  // from a demo identity or a global role flag.
  if (!context?.isOrganiser) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-mono tracking-widest text-[#cf9f5d]">
            AUVRESENCE / STUDIO
          </p>
          <h1 className="text-4xl font-display font-normal text-[#faf6f0]">
            You are not an organiser of this event
          </h1>
          <p className="text-sm text-[#faf6f0]/70 leading-relaxed">
            Organiser Studio is only available to the people who run an event.
            You can organise your own event from Home.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <button
            type="button"
            onClick={onSwitchToParticipantAccount}
            className="px-6 py-3 text-xs font-semibold tracking-wider bg-[#cf9f5d] text-[#0d0608] hover:bg-[#edd2ab] transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            Back to Home
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const selectedApp =
    dashboard?.applications.find((a) => a.id === selectedAppId) || null;

  const filteredApplications = (dashboard?.applications || []).filter((a) =>
    appFilter === 'ALL' ? true : a.status === appFilter
  );

  const happeningNow = context?.pulse.happeningNow || null;
  const upNext = context?.pulse.upNext || null;

  return (
    <div className="studio-shell max-w-[1440px] mx-auto px-5 sm:px-8 py-8 lg:py-10 pb-28 md:pb-16">
      {/* STUDIO COMMAND HEADER */}
      <div className="studio-header border-b border-[#edd2ab]/15 pb-7">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono tracking-widest">
            <span className="text-[#cf9f5d]">AUVRESENCE / STUDIO</span>
            <span aria-hidden="true" className="text-[#faf6f0]/30">
              ·
            </span>
            <span className="text-[#edd2ab]">
              EVENT OPERATIONS
            </span>
            <span aria-hidden="true" className="text-[#faf6f0]/30">
              ·
            </span>
            <span className="text-emerald-300 inline-flex items-center gap-1.5">
              {context?.event.status === 'LIVE' ? 'LIVE' : context?.event.status || 'DRAFT'}
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-display font-normal text-[#faf6f0]">
            {context?.event.title ?? 'Organiser Studio'}
          </h1>
        </div>

      </div>

        {/* Studio Navigation Tabs */}
        <div role="navigation" aria-label="Studio navigation" className="studio-rail">
          {[
            { id: 'OVERVIEW', label: 'Overview' },
            { id: 'APPLICATIONS', label: 'Applications' },
            { id: 'PARTICIPANTS', label: 'People' },
            { id: 'RESOURCES', label: 'Programme' },
            { id: 'SCHEDULE', label: 'Schedule' },
            { id: 'VENUES', label: 'Venue' },
            { id: 'CREDENTIALS', label: 'Credentials' },
            { id: 'LIVE', label: 'Live' },
            { id: 'ANNOUNCEMENTS', label: 'Announcements' },
            { id: 'SETTINGS', label: 'Settings' },
            { id: 'AUTOMATIONS', label: 'Automations · Prototype' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleSelectTab(t.id as OrganiserTab)}
              aria-current={activeTab === t.id ? 'page' : undefined}
              className={`min-h-11 py-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === t.id
                  ? 'text-[#cf9f5d] border-b border-[#cf9f5d] font-semibold'
                  : 'text-[#faf6f0]/60 hover:text-[#faf6f0]'
              }`}
            >
              {t.label}
            </button>
          ))}

          {onOpenAskAuvresence && (
            <button
              type="button"
              onClick={() => onOpenAskAuvresence()}
              className="py-1.5 text-[#edd2ab] hover:text-[#faf6f0] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-[#cf9f5d]" />
              Ask
            </button>
          )}
        </div>

      <div className="studio-workspace">

      {/* CLEAN STATE CONFIRMATION NOTICE */}
      {statusNotice && (
        <div className="border border-[#cf9f5d]/50 bg-[#1a0206] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-xs font-mono tracking-widest text-[#cf9f5d] font-semibold">
              {statusNotice.title}
            </span>
            {statusNotice.detail && (
              <span className="text-sm font-mono text-[#faf6f0]">
                {statusNotice.detail}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onSwitchToParticipantAccount}
              className="text-xs font-medium text-[#edd2ab] hover:text-[#faf6f0] underline cursor-pointer whitespace-nowrap"
            >
              View in Participant Space →
            </button>
            <button
              type="button"
              onClick={() => setStatusNotice(null)}
              className="text-xs text-[#faf6f0]/50 hover:text-[#faf6f0] cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ERROR NOTICE */}
      {errorBanner && (
        <div className="border border-red-500/40 bg-red-950/30 px-6 py-4 flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-xs font-mono tracking-widest text-red-300 uppercase">
              COULDN&apos;T COMPLETE ACTION
            </p>
            <p className="text-xs text-[#faf6f0]/80">{errorBanner}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setErrorBanner(null);
              fetchDashboard();
            }}
            className="px-4 py-1.5 text-xs border border-red-400/40 text-red-200 hover:bg-red-950/60 cursor-pointer whitespace-nowrap"
          >
            TRY AGAIN
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 01: OVERVIEW                                                    */}
      {/* =================================================================== */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-16">
          {/* LARGE UNBOXED TABULAR NUMBERS */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-10">
            <button
              type="button"
              onClick={() => handleSelectTab('APPLICATIONS')}
              className="text-left group cursor-pointer space-y-2"
            >
              <p className="text-5xl sm:text-6xl font-display font-normal text-[#faf6f0] tabular-nums group-hover:text-[#edd2ab] transition-colors">
                {String(dashboard?.stats.totalApplications ?? 0).padStart(
                  2,
                  '0'
                )}
              </p>
              <p className="text-xs font-mono tracking-widest text-[#cf9f5d]">
                APPLICATIONS
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setAppFilter('ACCEPTED');
                handleSelectTab('APPLICATIONS');
              }}
              className="text-left group cursor-pointer space-y-2"
            >
              <p className="text-5xl sm:text-6xl font-display font-normal text-[#faf6f0] tabular-nums group-hover:text-[#edd2ab] transition-colors">
                {String(
                  dashboard?.stats.acceptedParticipants ??
                    dashboard?.stats.accepted ??
                    0
                ).padStart(2, '0')}
              </p>
              <p className="text-xs font-mono tracking-widest text-emerald-300">
                ACCEPTED
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setAppFilter('UNDER_REVIEW');
                handleSelectTab('APPLICATIONS');
              }}
              className="text-left group cursor-pointer space-y-2"
            >
              <p className="text-5xl sm:text-6xl font-display font-normal text-[#faf6f0] tabular-nums group-hover:text-[#edd2ab] transition-colors">
                {String(dashboard?.stats.underReview ?? 0).padStart(2, '0')}
              </p>
              <p className="text-xs font-mono tracking-widest text-[#edd2ab]">
                PENDING
              </p>
            </button>

            <div className="space-y-2">
              <p className="text-5xl sm:text-6xl font-display font-normal text-[#faf6f0] tabular-nums">
                {String(dashboard?.stats.activeCredentials ?? 0).padStart(
                  2,
                  '0'
                )}
              </p>
              <p className="text-xs font-mono tracking-widest text-[#faf6f0]/60">
                ACTIVE PASSES
              </p>
            </div>
          </section>

          {/* SPLIT COMMAND SURFACE: TODAY TIMELINE + PENDING QUEUE */}
          <section className="grid lg:grid-cols-12 gap-12 pt-10 border-t border-[#cf9f5d]/20 items-start">
            {/* Left 7 Columns: TODAY Timeline */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono tracking-widest text-[#cf9f5d]">
                  TODAY
                </span>
                <button
                  type="button"
                  onClick={() => handleSelectTab('SCHEDULE')}
                  className="text-xs text-[#edd2ab]/75 hover:text-[#faf6f0] cursor-pointer"
                >
                  Open full schedule →
                </button>
              </div>

              <div className="divide-y divide-[#cf9f5d]/15 border-t border-[#cf9f5d]/15">
                {context?.sessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => openSessionSheet(s)}
                    className="w-full py-5 flex items-baseline justify-between gap-4 text-left hover:bg-[#1a0206]/60 px-3 -mx-3 transition-colors cursor-pointer"
                  >
                    <div className="flex items-baseline gap-6">
                      <span className="text-sm font-mono text-[#cf9f5d] tabular-nums w-14 shrink-0">
                        {s.startTime}
                      </span>
                      <div>
                        <p className="text-xl font-display text-[#faf6f0]">
                          {s.title}
                        </p>
                        <p className="text-xs font-mono text-[#edd2ab] uppercase mt-0.5">
                          {s.venueName}
                        </p>
                      </div>
                    </div>

                    <span className="text-xs font-mono text-[#faf6f0]/50 hover:text-[#cf9f5d] whitespace-nowrap">
                      Change location →
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right 5 Columns: Quick Venue Move & Pending Review */}
            <div className="lg:col-span-5 space-y-10 lg:border-l lg:border-[#cf9f5d]/15 lg:pl-10">
{/* Pending Applications Quick Access */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono tracking-widest text-[#cf9f5d]">
                    RECENT APPLICATIONS
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSelectTab('APPLICATIONS')}
                    className="text-xs text-[#edd2ab]/75 hover:text-[#faf6f0] cursor-pointer"
                  >
                    View all →
                  </button>
                </div>

                <div className="divide-y divide-[#cf9f5d]/15 border-t border-[#cf9f5d]/15">
                  {(dashboard?.applications || []).slice(0, 4).map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => {
                        setSelectedAppId(app.id);
                        handleSelectTab('APPLICATIONS');
                      }}
                      className="w-full py-3.5 flex items-center justify-between gap-4 text-left hover:bg-[#1a0206]/60 px-2 -mx-2 transition-colors cursor-pointer"
                    >
                      <div>
                        <p className="text-sm font-medium text-[#faf6f0]">
                          {app.applicantName}
                        </p>
                        <p className="text-xs text-[#faf6f0]/55">
                          {app.category}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-mono ${
                          app.status === 'ACCEPTED'
                            ? 'text-emerald-300'
                            : app.status === 'UNDER_REVIEW'
                            ? 'text-[#cf9f5d]'
                            : 'text-[#faf6f0]/50'
                        }`}
                      >
                        {app.status === 'UNDER_REVIEW' ? 'PENDING' : app.status}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 02: APPLICATIONS WORKFLOW TABLE + SIDE SHEET                    */}
      {/* =================================================================== */}
      {activeTab === 'APPLICATIONS' && (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-mono tracking-widest text-[#cf9f5d]">
                APPLICATIONS
              </p>
              <h2 className="text-3xl font-display font-normal text-[#faf6f0]">
                Participant Review
              </h2>
            </div>

            {/* Clean Segmented Filter */}
            <div className="flex items-center gap-1 p-1 bg-[#1a0206] border border-[#cf9f5d]/25">
              {[
                { id: 'ALL', label: 'All' },
                { id: 'UNDER_REVIEW', label: 'Pending' },
                { id: 'ACCEPTED', label: 'Accepted' },
                { id: 'REJECTED', label: 'Rejected' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setAppFilter(f.id as any)}
                  className={`px-3 py-1.5 text-xs transition-colors cursor-pointer whitespace-nowrap ${
                    appFilter === f.id
                      ? 'bg-[#cf9f5d] text-[#0d0608] font-semibold'
                      : 'text-[#edd2ab]/75 hover:text-[#faf6f0]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loading && !dashboard ? (
            <div className="space-y-3">
              <div className="h-12 bg-[#1a0206] animate-pulse" />
              <div className="h-12 bg-[#1a0206] animate-pulse" />
              <div className="h-12 bg-[#1a0206] animate-pulse" />
            </div>
          ) : filteredApplications.length === 0 ? (
            <div className="border border-[#cf9f5d]/20 bg-[#1a0206]/50 p-10 text-center space-y-2">
              <p className="text-lg font-display text-[#faf6f0]">
                No applications match this view.
              </p>
            </div>
          ) : (
            <>
              {/* DESKTOP WORKFLOW TABLE */}
              <div className="hidden md:block border-t border-[#cf9f5d]/25">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#cf9f5d]/20 text-[11px] font-mono tracking-widest text-[#edd2ab]/70 uppercase">
                      <th className="py-3.5 pr-4">Name</th>
                      <th className="py-3.5 px-4">Programme</th>
                      <th className="py-3.5 px-4">Institution</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 pl-4 text-right">Submitted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#cf9f5d]/15 text-sm">
                    {filteredApplications.map((app) => {
                      const isSelected = selectedAppId === app.id;
                      return (
                        <tr
                          key={app.id}
                          onClick={() => setSelectedAppId(app.id)}
                          className={`transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-[#24040a]'
                              : 'hover:bg-[#1a0206]/80'
                          }`}
                        >
                          <td className="py-4 pr-4 font-medium text-[#faf6f0]">
                            <button type="button" className="text-left min-h-11 focus-visible:underline" onClick={() => setSelectedAppId(app.id)}>{app.applicantName}</button>
                          </td>
                          <td className="py-4 px-4 text-[#faf6f0]/80">
                            {app.category}
                          </td>
                          <td className="py-4 px-4 text-[#faf6f0]/65">
                            {app.institution}
                          </td>
                          <td className="py-4 px-4 font-mono text-xs">
                            <span
                              className={
                                app.status === 'ACCEPTED'
                                  ? 'text-emerald-300 font-semibold'
                                  : app.status === 'UNDER_REVIEW'
                                  ? 'text-[#cf9f5d] font-semibold'
                                  : 'text-[#faf6f0]/50'
                              }
                            >
                              {app.status === 'UNDER_REVIEW'
                                ? 'PENDING'
                                : app.status}
                            </span>
                          </td>
                          <td className="py-4 pl-4 text-right font-mono text-xs text-[#faf6f0]/60 tabular-nums">
                            {app.createdAt
                              ? new Date(app.createdAt).toLocaleDateString(
                                  'en-GB',
                                  {
                                    day: '2-digit',
                                    month: 'short',
                                  }
                                )
                              : 'Today'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* MOBILE TOUCH-FRIENDLY APPLICATION LIST */}
              <div className="md:hidden divide-y divide-[#cf9f5d]/20 border-t border-[#cf9f5d]/20">
                {filteredApplications.map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => setSelectedAppId(app.id)}
                    className="w-full py-4 text-left flex items-center justify-between gap-4 cursor-pointer"
                  >
                    <div className="space-y-1">
                      <p className="text-base font-medium text-[#faf6f0]">
                        {app.applicantName}
                      </p>
                      <p className="text-xs text-[#faf6f0]/65">
                        {app.category} · {app.institution}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-mono shrink-0 ${
                        app.status === 'ACCEPTED'
                          ? 'text-emerald-300 font-semibold'
                          : app.status === 'UNDER_REVIEW'
                          ? 'text-[#cf9f5d] font-semibold'
                          : 'text-[#faf6f0]/50'
                      }`}
                    >
                      {app.status === 'UNDER_REVIEW' ? 'PENDING' : app.status}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'SETTINGS' && context && <StudioSettings key={context.event.id} context={context} token={authToken} onSaved={onRefreshContext} />}
      {activeTab === 'AUTOMATIONS' && <AutomationsPrototype />}

      {/* =================================================================== */}
      {/* TAB 03: SCHEDULE TIMELINE                                           */}
      {/* =================================================================== */}
      {activeTab === 'SCHEDULE' && (
        <div className="space-y-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-mono tracking-widest text-[#cf9f5d]">
                SCHEDULE
              </p>
              <h2 className="text-3xl font-display font-normal text-[#faf6f0]">
                Programme & Venue Assignment
              </h2>
            </div>

</div>

          {context && <SessionComposer context={context} token={authToken} onSaved={onRefreshContext} />}
          {!context?.sessions.length && <p className="text-sm text-[#faf6f0]/60">No sessions yet. Add the first programme moment.</p>}
          <div className="border-t border-[#cf9f5d]/20 divide-y divide-[#cf9f5d]/15">
            {context?.sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => openSessionSheet(s)}
                className="w-full py-7 grid md:grid-cols-12 gap-6 items-baseline text-left hover:bg-[#1a0206]/60 px-4 -mx-4 transition-colors cursor-pointer"
              >
                <div className="md:col-span-3 font-mono text-xl text-[#faf6f0] tabular-nums">
                  {s.startTime}{' '}
                  <span className="text-xs text-[#faf6f0]/45">
                    – {s.endTime}
                  </span>
                </div>

                <div className="md:col-span-5 space-y-1">
                  <h3 className="text-2xl font-display text-[#faf6f0]">
                    {s.title}
                  </h3>
                  <p className="text-xs text-[#faf6f0]/65">{s.description}</p>
                </div>

                <div className="md:col-span-4 flex md:justify-end items-center gap-6">
                  <div className="text-right">
                    <p className="text-sm font-mono font-semibold text-[#edd2ab] uppercase">
                      {s.venueName}
                    </p>
                    <p className="text-[11px] font-mono text-[#faf6f0]/50">
                      {s.venueFloor}
                    </p>
                  </div>
                  <span className="text-xs font-mono text-[#cf9f5d] whitespace-nowrap">
                    Edit →
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 03B: VENUE STUDIO (MULTI-FLOOR WALK-TO-MAP & POI BUILDER)       */}
      {/* =================================================================== */}
      {activeTab === 'VENUES' && (
        <div className="space-y-12">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#cf9f5d]/20 pb-6">
            <div className="space-y-1">
              <p className="text-xs font-mono tracking-widest text-[#cf9f5d]">
                SPATIAL VENUE STUDIO
              </p>
              <h2 className="text-3xl font-display font-normal text-[#faf6f0]">
                {context?.event.venueName || 'Your event needs a place'}
              </h2>
              {context?.event.venueAddress && (
                <p className="text-xs font-mono text-[#edd2ab]/75">
                  {context.event.venueAddress}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {[...(context?.floors || [])]
                .sort((a, b) => a.levelOrder - b.levelOrder)
                .map((f) => f.name)
                .map((fl) => (
                <button
                  key={fl}
                  type="button"
                  onClick={() => {
                    setStudioFloorName(fl);
                    const flObj = (context?.floors || []).find(
                      (f) => f.name === fl
                    );
                    setRecordedPoints(flObj?.recordedPath || []);
                  }}
                  className={`px-4 py-2 text-xs font-mono uppercase transition-colors cursor-pointer ${
                    studioFloorName === fl
                      ? 'bg-[#cf9f5d] text-[#0d0608] font-semibold'
                      : 'border border-[#cf9f5d]/30 text-[#edd2ab] hover:bg-[#1a0206]'
                  }`}
                >
                  {fl}
                </button>
              )
                )}
              <form
                onSubmit={handleCreateFloor}
                className="flex items-center gap-2"
                aria-label="Add a floor"
              >
                <label htmlFor="new-floor-name" className="sr-only">
                  New floor name
                </label>
                <input
                  id="new-floor-name"
                  type="text"
                  value={newFloorName}
                  onChange={(e) => setNewFloorName(e.target.value)}
                  placeholder="Add floor, e.g. Ground"
                  maxLength={60}
                  className="auv-input !min-h-[36px] !w-44 !text-sm"
                />
                <button
                  type="submit"
                  disabled={addingFloor || newFloorName.trim().length < 2}
                  className="auv-btn auv-btn-secondary !min-h-[36px]"
                >
                  {addingFloor ? 'Adding' : 'Add'}
                </button>
              </form>
            </div>
          </div>

          {(context?.floors || []).length === 0 && (
            <div className="max-w-xl py-16 space-y-3">
              <h3 className="text-2xl font-display text-[#faf6f0]">
                This venue is waiting to be mapped.
              </h3>
              <p className="text-sm text-[#faf6f0]/65">
                Add the first floor above, using whatever name your venue
                uses. Places and routes are drawn on floors you create.
              </p>
            </div>
          )}
          <div
            className={`grid lg:grid-cols-12 gap-12 items-start ${
              (context?.floors || []).length === 0 ? 'hidden' : ''
            }`}
          >
            {/* Left 7 Columns: Draw-to-Map Interactive Floor Canvas & POI Directory */}
            <div className="lg:col-span-7 space-y-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-xs font-mono tracking-widest text-[#cf9f5d] uppercase">
                    {studioFloorName} · INTERACTIVE FLOORPLATE
                  </span>
                  <p className="text-xs text-[#faf6f0]/60">
                    {isRecordingPath
                      ? 'Click to sketch a corridor. This is not GPS tracking; canvas distances are estimates.'
                      : 'Click anywhere on the floor canvas to set coordinates for a new location.'}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {!isRecordingPath ? (
                    <button
                      type="button"
                      onClick={() => {
                        const flObj = (context?.floors || []).find(
                          (f) => f.name === studioFloorName
                        );
                        setRecordedPoints(flObj?.recordedPath || []);
                        setIsRecordingPath(true);
                      }}
                      className="px-4 py-2 text-xs font-mono border border-[#cf9f5d]/40 text-[#edd2ab] hover:bg-[#1a0206] cursor-pointer"
                    >
                      Draw-to-Map Path
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setRecordedPoints([])}
                        className="px-3 py-2 text-xs font-mono border border-[#cf9f5d]/30 text-[#faf6f0]/70 hover:text-[#faf6f0] cursor-pointer"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        disabled={savingFloorPath}
                        onClick={handleSaveFloorPath}
                        className="px-4 py-2 text-xs font-mono font-semibold bg-[#cf9f5d] text-[#0d0608] hover:bg-[#edd2ab] cursor-pointer"
                      >
                        {savingFloorPath ? 'Saving...' : 'Save Path'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Interactive Floorplate Canvas */}
              <div
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = Math.max(
                    6,
                    Math.min(
                      94,
                      Math.round(((e.clientX - rect.left) / rect.width) * 100)
                    )
                  );
                  const y = Math.max(
                    6,
                    Math.min(
                      94,
                      Math.round(((e.clientY - rect.top) / rect.height) * 100)
                    )
                  );
                  if (isRecordingPath) {
                    setRecordedPoints((prev) => [...prev, { x, y }]);
                  } else {
                    setNewPoiX(x);
                    setNewPoiY(y);
                  }
                }}
                className="relative w-full h-[360px] bg-[#130307] border border-[#cf9f5d]/30 overflow-hidden cursor-crosshair select-none"
              >
                <svg
                  className="absolute inset-0 w-full h-full"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <line
                    x1="6"
                    y1="50"
                    x2="94"
                    y2="50"
                    stroke="rgba(207, 159, 93, 0.1)"
                    strokeDasharray="1.5,1.5"
                    strokeWidth="0.25"
                  />
                  <line
                    x1="50"
                    y1="8"
                    x2="50"
                    y2="92"
                    stroke="rgba(207, 159, 93, 0.1)"
                    strokeDasharray="1.5,1.5"
                    strokeWidth="0.25"
                  />

                  {/* Draw-to-Map Path */}
                  {(isRecordingPath
                    ? recordedPoints
                    : (context?.floors || []).find(
                        (f) => f.name === studioFloorName
                      )?.recordedPath || []
                  ).length > 1 && (
                    <polyline
                      fill="none"
                      stroke="#cf9f5d"
                      strokeWidth="0.9"
                      strokeDasharray="2,1"
                      points={(isRecordingPath
                        ? recordedPoints
                        : (context?.floors || []).find(
                            (f) => f.name === studioFloorName
                          )?.recordedPath || []
                      )
                        .map((pt) => `${pt.x},${pt.y}`)
                        .join(' ')}
                    />
                  )}
                </svg>

                {/* Placement cursor preview */}
                {!isRecordingPath && (
                  <div
                    style={{ left: `${newPoiX}%`, top: `${newPoiY}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  >
                    <div className="w-5 h-5 rounded-full border border-dashed border-[#cf9f5d] flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#cf9f5d]" />
                    </div>
                  </div>
                )}

                {(context?.venues || [])
                  .filter(
                    (v) =>
                      v.floor === studioFloorName ||
                      (v.connectedFloors || []).includes(studioFloorName)
                  )
                  .map((v) => (
                    <div
                      key={v.id}
                      style={{ left: `${v.mapX}%`, top: `${v.mapY}%` }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none"
                    >
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-[#0d0608] ${
                          v.operationalStatus !== 'OPEN'
                            ? 'bg-red-800 border border-red-400'
                            : 'bg-[#cf9f5d] ring-2 ring-[#cf9f5d]/25'
                        }`}
                      ><PoiIcon type={v.poiType} /></div>
                      <span className="mt-1 px-1.5 py-0.5 text-[10px] font-mono bg-[#0d0608]/90 text-[#faf6f0] border border-[#cf9f5d]/30 whitespace-nowrap">
                        {v.name}
                      </span>
                    </div>
                  ))}
              </div>

              {/* Existing Floor POIs with Status Toggle */}
              <div className="space-y-4">
                <p className="text-xs font-mono tracking-widest text-[#cf9f5d] uppercase">
                  LOCATIONS & AMENITIES ({context?.venues.length || 0})
                </p>
                <div className="divide-y divide-[#cf9f5d]/15 border-t border-[#cf9f5d]/15">
                  {context?.venues.map((v) => (
                    <div
                      key={v.id}
                      className="py-3.5 flex flex-wrap items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-base font-display text-[#faf6f0] uppercase">
                            {v.name}
                          </span>
                          <span className="text-xs font-mono text-[#cf9f5d]">
                            {v.floor}
                          </span>
                          <span className="text-[11px] font-mono text-[#edd2ab]/70 uppercase">
                            {v.poiType.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-[#faf6f0]/55">{v.zone}</p>
                      </div>

                      <div className="flex items-center gap-4">
                        <span
                          className={`text-xs font-mono ${
                            v.operationalStatus === 'OPEN'
                              ? 'text-emerald-300'
                              : 'text-red-300'
                          }`}
                        >
                          {v.operationalStatus.replace('_', ' ')}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleVenueStatus(v)}
                          className="px-3 py-1.5 text-xs font-mono border border-[#cf9f5d]/30 text-[#edd2ab] hover:bg-[#1a0206] cursor-pointer"
                        >
                          {v.operationalStatus === 'OPEN'
                            ? 'Mark Unavailable'
                            : 'Reopen'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right 5 Columns: Add Location / Amenity + Connect Pathway */}
            <div className="lg:col-span-5 space-y-10 lg:border-l lg:border-[#cf9f5d]/15 lg:pl-10">
              <form onSubmit={handleCreatePoi} className="space-y-5">
                <div className="space-y-1">
                  <p className="text-xs font-mono tracking-widest text-[#cf9f5d]">
                    ADD POINT OF INTEREST
                  </p>
                  <h3 className="text-2xl font-display text-[#faf6f0]">
                    New Room, Amenity or Connector
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs text-[#edd2ab]">Name</label>
                    <input
                      type="text"
                      required
                      value={newPoiName}
                      onChange={(e) => setNewPoiName(e.target.value)}
                      placeholder="e.g., Seminar Hall B"
                      className="w-full px-3 py-2.5 text-xs bg-[#1a0206] border border-[#cf9f5d]/35 text-[#faf6f0]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs text-[#edd2ab]">Zone</label>
                    <input
                      type="text"
                      value={newPoiZone}
                      onChange={(e) => setNewPoiZone(e.target.value)}
                      placeholder="e.g., East Wing"
                      className="w-full px-3 py-2.5 text-xs bg-[#1a0206] border border-[#cf9f5d]/35 text-[#faf6f0]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs text-[#edd2ab]">Type</label>
                    <select
                      value={newPoiType}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewPoiType(val);
                        if (
                          ['FOOD', 'CAFE', 'WATER', 'WASHROOM', 'MEDICAL'].includes(
                            val
                          )
                        ) {
                          setNewPoiCategory('AMENITY');
                        } else if (
                          ['LIFT', 'STAIRS', 'ESCALATOR', 'RAMP'].includes(val)
                        ) {
                          setNewPoiCategory('MOVEMENT');
                        } else if (
                          ['EMERGENCY_EXIT', 'ASSEMBLY_POINT'].includes(val)
                        ) {
                          setNewPoiCategory('SAFETY');
                        } else {
                          setNewPoiCategory('EVENT');
                        }
                      }}
                      className="w-full px-3 py-2.5 text-xs bg-[#1a0206] border border-[#cf9f5d]/35 text-[#faf6f0]"
                    >
                      <option value="ROOM">Session Room</option>
                      <option value="HALL">Main Hall / Auditorium</option>
                      <option value="REGISTRATION">Registration Desk</option>
                      <option value="HELP_DESK">Help Desk</option>
                      <option value="FOOD">Food & Dining</option>
                      <option value="WASHROOM">Washrooms</option>
                      <option value="MEDICAL">Medical Station</option>
                      <option value="LIFT">Step-Free Lift</option>
                      <option value="STAIRS">Staircase</option>
                      <option value="EMERGENCY_EXIT">Emergency Exit</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs text-[#edd2ab]">
                      Coordinates ({studioFloorName})
                    </label>
                    <div className="px-3 py-2.5 text-xs font-mono bg-[#1a0206] border border-[#cf9f5d]/25 text-[#edd2ab] tabular-nums">
                      X: {newPoiX}% · Y: {newPoiY}%
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs text-[#edd2ab]">
                    Description
                  </label>
                  <input
                    type="text"
                    value={newPoiDesc}
                    onChange={(e) => setNewPoiDesc(e.target.value)}
                    placeholder="Brief guidance for participants..."
                    className="w-full px-3 py-2.5 text-xs bg-[#1a0206] border border-[#cf9f5d]/35 text-[#faf6f0]"
                  />
                </div>

                <label className="flex items-center gap-2.5 text-xs text-[#edd2ab] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newPoiAccessible}
                    onChange={(e) => setNewPoiAccessible(e.target.checked)}
                    className="accent-[#cf9f5d]"
                  />
                  Step-free / wheelchair accessible
                </label>

                <button
                  type="submit"
                  disabled={creatingPoi}
                  className="px-6 py-3 text-xs font-semibold tracking-widest bg-[#cf9f5d] text-[#0d0608] hover:bg-[#edd2ab] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {creatingPoi ? 'ADDING...' : `ADD TO ${studioFloorName.toUpperCase()}`}
                </button>
              </form>

              {/* Connect Pathway Edge */}
              <form
                onSubmit={handleCreateEdge}
                className="pt-8 border-t border-[#cf9f5d]/15 space-y-4"
              >
                <p className="text-xs font-mono tracking-widest text-[#cf9f5d]">
                  CONNECT WAYFINDING PATHWAY
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={edgeFromId}
                    onChange={(e) => setEdgeFromId(Number(e.target.value))}
                    className="px-3 py-2.5 text-xs bg-[#1a0206] border border-[#cf9f5d]/35 text-[#faf6f0]"
                  >
                    <option value={0}>From location...</option>
                    {context?.venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.floor})
                      </option>
                    ))}
                  </select>
                  <select
                    value={edgeToId}
                    onChange={(e) => setEdgeToId(Number(e.target.value))}
                    className="px-3 py-2.5 text-xs bg-[#1a0206] border border-[#cf9f5d]/35 text-[#faf6f0]"
                  >
                    <option value={0}>To location...</option>
                    {context?.venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.floor})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-xs text-[#edd2ab]">
                    <span>Distance (m):</span>
                    <input
                      type="number"
                      min={5}
                      max={1000}
                      value={edgeDist}
                      onChange={(e) => setEdgeDist(Number(e.target.value))}
                      className="w-20 px-2.5 py-1.5 text-xs font-mono bg-[#1a0206] border border-[#cf9f5d]/35 text-[#faf6f0]"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-[#edd2ab] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={edgeAccessible}
                      onChange={(e) => setEdgeAccessible(e.target.checked)}
                      className="accent-[#cf9f5d]"
                    />
                    Step-free
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={creatingEdge || !edgeFromId || !edgeToId}
                  className="px-5 py-2.5 text-xs font-mono border border-[#cf9f5d]/40 text-[#edd2ab] hover:bg-[#1a0206] cursor-pointer disabled:opacity-40"
                >
                  {creatingEdge ? 'CONNECTING...' : 'CONNECT LOCATIONS'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 04: LIVE OPERATIONS                                             */}
      {/* =================================================================== */}
      {activeTab === 'LIVE' && (
        <div className="space-y-14">
          <div className="grid md:grid-cols-3 gap-10 border-b border-[#cf9f5d]/20 pb-12">
            {/* LIVE NOW */}
            <div className="space-y-3">
              <p className="text-xs font-mono tracking-widest text-emerald-300">
                LIVE NOW
              </p>
              {happeningNow ? (
                <>
                  <h2 className="text-3xl font-display text-[#faf6f0]">
                    {happeningNow.title}
                  </h2>
                  <p className="text-base font-mono text-[#edd2ab] uppercase">
                    {happeningNow.venueName}
                  </p>
                  <p className="text-xs font-mono text-[#faf6f0]/55 tabular-nums">
                    {happeningNow.startTime} – {happeningNow.endTime}
                  </p>
                </>
              ) : (
                <p className="text-lg font-display text-[#faf6f0]/60">
                  No active session
                </p>
              )}
            </div>

            {/* UP NEXT */}
            <div className="space-y-3 md:border-l md:border-[#cf9f5d]/15 md:pl-8">
              <p className="text-xs font-mono tracking-widest text-[#cf9f5d]">
                UP NEXT
              </p>
              {upNext ? (
                <>
                  <h2 className="text-3xl font-display text-[#faf6f0]">
                    {upNext.title}
                  </h2>
                  <p className="text-base font-mono text-[#edd2ab] uppercase">
                    {upNext.venueName}
                  </p>
                  <p className="text-xs font-mono text-[#faf6f0]/55 tabular-nums">
                    {upNext.startTime} – {upNext.endTime}
                  </p>
                </>
              ) : (
                <p className="text-lg font-display text-[#faf6f0]/60">
                  No upcoming session is marked
                </p>
              )}
            </div>

            {/* LATEST UPDATE */}
            <div className="space-y-3 md:border-l md:border-[#cf9f5d]/15 md:pl-8">
              <p className="text-xs font-mono tracking-widest text-[#edd2ab]/75">
                LATEST UPDATE
              </p>
              {context?.announcements[0] ? (
                <>
                  <h2 className="text-2xl font-display text-[#faf6f0]">
                    {context.announcements[0].title}
                  </h2>
                  <p className="text-xs text-[#faf6f0]/65 line-clamp-2">
                    {context.announcements[0].body}
                  </p>
                </>
              ) : (
                <p className="text-sm text-[#faf6f0]/60">
                  No updates published yet.
                </p>
              )}
            </div>
          </div>

          {/* QUICK ACTIONS */}
          <div className="space-y-5">
            <p className="text-xs font-mono tracking-widest text-[#cf9f5d]">
              QUICK ACTIONS
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => handleSelectTab('SCHEDULE')}
                className="px-6 py-3.5 text-xs font-semibold tracking-wider bg-[#cf9f5d] text-[#0d0608] hover:bg-[#edd2ab] transition-colors cursor-pointer whitespace-nowrap"
              >
                Open schedule
              </button>

              <button
                type="button"
                onClick={() => handleSelectTab('ANNOUNCEMENTS')}
                className="px-6 py-3.5 text-xs font-medium border border-[#cf9f5d]/40 text-[#edd2ab] hover:bg-[#1a0206] transition-colors cursor-pointer whitespace-nowrap"
              >
                Publish update
              </button>

              <button
                type="button"
                onClick={() => handleSelectTab('APPLICATIONS')}
                className="px-6 py-3.5 text-xs font-medium border border-[#cf9f5d]/40 text-[#edd2ab] hover:bg-[#1a0206] transition-colors cursor-pointer whitespace-nowrap"
              >
                View participants
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'CREDENTIALS' && (
        <section>
          <p className="text-xs font-mono tracking-[.2em] text-[#cf9f5d]">CREDENTIALS</p>
          <h2 className="font-display text-4xl mt-4 mb-8">Identity, issued.</h2>
          {(dashboard?.applications || []).some(app => app.credential) ? <ul className="divide-y divide-[#edd2ab]/15 border-t border-[#edd2ab]/15">{dashboard?.applications.filter(app => app.credential).map(app => <li key={app.id} className="py-5 flex flex-wrap justify-between items-center gap-4"><div><p className="text-base">{app.applicantName}</p><p className="text-xs text-[#faf6f0]/60 mt-2">{app.credential!.participantCode} · {app.credential!.roleCategory}</p></div><div className="flex items-center gap-5"><span className="text-xs font-mono text-[#edd2ab]">{app.credential!.status}</span><button type="button" className="auv-btn auv-btn-text" disabled={updatingCredential !== null || (app.credential!.status !== 'ACTIVE' && app.status !== 'ACCEPTED')} onClick={() => handleCredentialStatus(app.credential!.id, app.credential!.status === 'ACTIVE' ? 'REVOKED' : 'ACTIVE')}>{updatingCredential === app.credential!.id ? 'Saving…' : app.credential!.status === 'ACTIVE' ? 'Revoke' : 'Reactivate'}</button><button type="button" className="auv-btn auv-btn-text" onClick={() => onOpenVerificationPreview(app.credential!.verificationToken)}>Verify <ExternalLink className="h-3.5 w-3.5" /></button></div></li>)}</ul> : <p className="text-[#edd2ab]">Accept an application to issue the first event pass.</p>}
        </section>
      )}
      {activeTab === 'PARTICIPANTS' && (
        <section className="max-w-4xl">
          <p className="text-xs font-mono tracking-[.25em] text-[#cf9f5d]">PEOPLE</p>
          <h2 className="mt-5 mb-10 font-display text-4xl">The people making it happen.</h2>
          {(dashboard?.applications || []).filter(app => app.status === 'ACCEPTED').length === 0 ? (
            <p className="text-[#edd2ab]">Your people will appear here as applications are accepted.</p>
          ) : <ul className="divide-y divide-[#edd2ab]/15 border-t border-[#edd2ab]/15">
            {(dashboard?.applications || []).filter(app => app.status === 'ACCEPTED').map(app => <li key={app.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-6"><div><h3 className="font-sans text-base">{app.applicantName}</h3><p className="mt-1 text-sm text-[#faf6f0]/60">{app.institution}</p></div><span className="text-xs font-mono text-[#edd2ab]">{app.category}</span></li>)}
          </ul>}
        </section>
      )}
      {activeTab === 'RESOURCES' && (
        <section className="max-w-4xl">
          <p className="text-xs font-mono tracking-[.25em] text-[#cf9f5d]">PROGRAMME</p>
          <div className="mt-5 mb-10 flex flex-wrap items-end justify-between gap-5"><h2 className="font-display text-4xl">The moments you’re shaping.</h2><button type="button" className="auv-btn auv-btn-secondary" onClick={() => handleSelectTab('SCHEDULE')}>Edit programme <ArrowRight className="h-4 w-4" /></button></div>
          {context?.sessions.length === 0 ? <p className="text-[#edd2ab]">Nothing scheduled yet. Build the first moment.</p> : <ul className="divide-y divide-[#edd2ab]/15 border-t border-[#edd2ab]/15">{context?.sessions.map(moment => <li key={moment.id} className="py-7"><p className="text-xs font-mono text-[#cf9f5d]">{moment.track} · {moment.dayLabel}</p><h3 className="font-display text-3xl mt-3">{moment.title}</h3><p className="mt-3 max-w-2xl text-sm text-[#faf6f0]/70 leading-relaxed">{moment.description}</p>{moment.speaker && <p className="text-xs text-[#edd2ab] mt-3">With {moment.speaker}</p>}</li>)}</ul>}
          {(context?.resources.length || 0) > 0 && <div className="mt-12 border-t border-[#edd2ab]/15 pt-8"><h3 className="font-display text-2xl mb-5">Event resources</h3>{context?.resources.map(resource => <p key={resource.id} className="py-3 text-sm text-[#edd2ab]">{resource.title} · {resource.category}</p>)}</div>}
        </section>
      )}

      {/* =================================================================== */}
      {/* TAB 05: ANNOUNCEMENTS / UPDATES                                     */}
      {/* =================================================================== */}
      {activeTab === 'ANNOUNCEMENTS' && (
        <div className="grid lg:grid-cols-12 gap-12 items-start">
          {/* Left 6 Columns: Clean Publishing Surface */}
          <div className="lg:col-span-6 space-y-6">
            <div className="space-y-1">
              <p className="text-xs font-mono tracking-widest text-[#cf9f5d]">
                NEW UPDATE
              </p>
              <h2 className="text-3xl font-display font-normal text-[#faf6f0]">
                Publish to Event
              </h2>
            </div>

            <form onSubmit={handlePublishAnnouncement} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-xs text-[#edd2ab]">Audience</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'ALL_APPLICANTS', label: 'Everyone' },
                    { id: 'ACCEPTED_ONLY', label: 'Participants' },
                    { id: 'ORGANISERS_ONLY', label: 'Organisers' },
                  ].map((aud) => (
                    <button
                      key={aud.id}
                      type="button"
                      onClick={() => setAnnAudience(aud.id as any)}
                      className={`px-4 py-2 text-xs transition-colors cursor-pointer whitespace-nowrap ${
                        annAudience === aud.id
                          ? 'bg-[#cf9f5d] text-[#0d0608] font-semibold'
                          : 'border border-[#cf9f5d]/30 text-[#edd2ab] hover:bg-[#1a0206]'
                      }`}
                    >
                      {aud.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs text-[#edd2ab]">Type</label>
                  <select
                    value={annType}
                    onChange={(e) => setAnnType(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs bg-[#1a0206] border border-[#cf9f5d]/35 text-[#faf6f0]"
                  >
                    <option value="GENERAL">General</option>
                    <option value="SCHEDULE">Schedule</option>
                    <option value="VENUE">Venue / Room</option>
                    <option value="FOOD">Food & Dining</option>
                    <option value="SAFETY">Safety</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs text-[#edd2ab]">Priority</label>
                  <select
                    value={annPriority}
                    onChange={(e) => setAnnPriority(e.target.value as any)}
                    className="w-full px-3 py-2.5 text-xs bg-[#1a0206] border border-[#cf9f5d]/35 text-[#faf6f0]"
                  >
                    <option value="STANDARD">Standard</option>
                    <option value="IMPORTANT">Important</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs text-[#edd2ab]">
                    Link Location
                  </label>
                  <select
                    value={annAttachedVenueId}
                    onChange={(e) => setAnnAttachedVenueId(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs bg-[#1a0206] border border-[#cf9f5d]/35 text-[#faf6f0]"
                  >
                    <option value="">None</option>
                    {context?.venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.floor})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs text-[#edd2ab]">Headline</label>
                <input
                  type="text"
                  required
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  placeholder="e.g., Doors now open 15 minutes earlier"
                  className="w-full px-4 py-3 text-sm bg-[#1a0206] border border-[#cf9f5d]/35 text-[#faf6f0] focus:outline-none focus:border-[#cf9f5d]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs text-[#edd2ab]">Message</label>
                <textarea
                  rows={4}
                  required
                  value={annBody}
                  onChange={(e) => setAnnBody(e.target.value)}
                  placeholder="Write a concise update for your audience..."
                  className="w-full px-4 py-3 text-sm bg-[#1a0206] border border-[#cf9f5d]/35 text-[#faf6f0] focus:outline-none focus:border-[#cf9f5d]"
                />
              </div>

              <button
                type="submit"
                disabled={publishingAnn}
                className="px-7 py-3 text-xs font-semibold tracking-widest bg-[#cf9f5d] text-[#0d0608] hover:bg-[#edd2ab] transition-colors cursor-pointer disabled:opacity-50"
              >
                {publishingAnn ? 'PUBLISHING...' : 'PUBLISH'}
              </button>
            </form>
          </div>

          {/* Right 6 Columns: Published Updates */}
          <div className="lg:col-span-6 space-y-6 lg:border-l lg:border-[#cf9f5d]/15 lg:pl-10">
            <p className="text-xs font-mono tracking-widest text-[#cf9f5d]">
              PUBLISHED UPDATES
            </p>
            <div className="divide-y divide-[#cf9f5d]/15 border-t border-[#cf9f5d]/15">
              {context?.announcements.map((a) => (
                <div key={a.id} className="py-5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono text-[#cf9f5d]">
                    <span>
                      {a.audience === 'ALL_APPLICANTS'
                        ? 'EVERYONE'
                        : a.audience === 'ACCEPTED_ONLY'
                        ? 'PARTICIPANTS'
                        : 'ORGANISERS'}
                    </span>
                    <span className="text-[#faf6f0]/50">
                      {a.publishedAt
                        ? new Date(a.publishedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                    </span>
                  </div>
                  <h3 className="text-xl font-display text-[#faf6f0]">
                    {a.title}
                  </h3>
                  <p className="text-xs text-[#faf6f0]/70 leading-relaxed">
                    {a.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* APPLICATION SIDE SHEET                                              */}
      {/* =================================================================== */}
      {selectedApp && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs" onMouseDown={e => { if (e.target === e.currentTarget) setSelectedAppId(null); }}>
          <div ref={appSheetRef} role="dialog" aria-modal="true" aria-label="Review application" tabIndex={-1} className="w-full max-w-lg bg-[#0d0608] border-l border-[#cf9f5d]/35 h-full flex flex-col justify-between p-8 overflow-y-auto">
            <div className="space-y-8">
              <div className="flex items-start justify-between gap-4 border-b border-[#cf9f5d]/20 pb-5">
                <div className="space-y-1">
                  <p className="text-xs font-mono tracking-widest text-[#cf9f5d]">
                    APPLICATION
                  </p>
                  <h2 className="text-3xl font-display font-normal text-[#faf6f0]">
                    {selectedApp.applicantName}
                  </h2>
                  <p className="text-xs font-mono text-[#edd2ab]/80">
                    {selectedApp.institution}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAppId(null)}
                  className="p-2 text-[#faf6f0]/60 hover:text-[#faf6f0] cursor-pointer"
                  aria-label="Close application sheet"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Status Morph Indicator */}
              <div className="flex items-center justify-between py-4 border-b border-[#cf9f5d]/15">
                <span className="text-xs font-mono text-[#faf6f0]/60">
                  STATUS
                </span>
                <span
                  className={`text-sm font-mono font-semibold tracking-wider ${
                    selectedApp.status === 'ACCEPTED'
                      ? 'text-emerald-300'
                      : selectedApp.status === 'UNDER_REVIEW'
                      ? 'text-[#cf9f5d]'
                      : 'text-red-300'
                  }`}
                >
                  {selectedApp.status === 'UNDER_REVIEW'
                    ? 'PENDING'
                    : selectedApp.status}
                </span>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-mono text-[#faf6f0]/55">PROGRAMME</p>
                <p className="text-base text-[#faf6f0]">
                  {selectedApp.category}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-mono text-[#faf6f0]/55">STATEMENT</p>
                <p className="text-sm text-[#faf6f0]/85 leading-relaxed">
                  {selectedApp.statement}
                </p>
              </div>

              {selectedApp.credential && (
                <div className="p-5 border border-[#cf9f5d]/30 bg-[#1a0206] space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#cf9f5d]">CREDENTIAL</span>
                    <span className="text-emerald-300">
                      {selectedApp.credential.status}
                    </span>
                  </div>
                  <p className="text-sm font-mono text-[#faf6f0] tabular-nums">
                    {selectedApp.credential.participantCode}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenVerificationPreview(
                        selectedApp.credential!.verificationToken
                      )
                    }
                    className="text-xs text-[#edd2ab] hover:text-[#faf6f0] inline-flex items-center gap-1.5 underline cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Verification View
                  </button>
                </div>
              )}
            </div>

            {/* Side Sheet Actions */}
            <div className="pt-6 border-t border-[#cf9f5d]/20 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={
                  updatingAppId === selectedApp.id ||
                  selectedApp.status === 'ACCEPTED'
                }
                onClick={() =>
                  handleReviewApplication(selectedApp.id, 'ACCEPTED')
                }
                className="flex-1 py-3 px-5 text-xs font-semibold tracking-widest bg-[#cf9f5d] text-[#0d0608] hover:bg-[#edd2ab] transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
              >
                <Check className="w-4 h-4" />
                ACCEPT
              </button>

              <button
                type="button"
                disabled={
                  updatingAppId === selectedApp.id ||
                  selectedApp.status === 'REJECTED'
                }
                onClick={() =>
                  handleReviewApplication(selectedApp.id, 'REJECTED')
                }
                className="py-3 px-5 text-xs font-semibold tracking-widest border border-[#cf9f5d]/35 text-[#edd2ab] hover:bg-[#1a0206] transition-colors cursor-pointer disabled:opacity-40"
              >
                REJECT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* SESSION SIDE SHEET (CHANGE LOCATION / SCHEDULE)                     */}
      {/* =================================================================== */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs" onMouseDown={e => { if (e.target === e.currentTarget) setSelectedSession(null); }}>
          <form ref={sessionSheetRef} role="dialog" aria-modal="true" aria-label="Edit session" tabIndex={-1}
            onSubmit={handleSaveSessionSheet}
            className="w-full max-w-lg bg-[#0d0608] border-l border-[#cf9f5d]/35 h-full flex flex-col justify-between p-8 overflow-y-auto"
          >
            <div className="space-y-8">
              <div className="flex items-start justify-between gap-4 border-b border-[#cf9f5d]/20 pb-5">
                <div className="space-y-1">
                  <p className="text-xs font-mono tracking-widest text-[#cf9f5d] tabular-nums">
                    {selectedSession.startTime}
                  </p>
                  <h2 className="text-3xl font-display font-normal text-[#faf6f0] uppercase">
                    {selectedSession.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSession(null)}
                  className="p-2 text-[#faf6f0]/60 hover:text-[#faf6f0] cursor-pointer"
                  aria-label="Close session sheet"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* CURRENT LOCATION */}
              <div className="space-y-1.5">
                <p className="text-xs font-mono tracking-widest text-[#faf6f0]/55">
                  CURRENT LOCATION
                </p>
                <p className="text-2xl font-mono font-semibold text-[#edd2ab] uppercase">
                  {selectedSession.venueName || 'No destination selected.'}
                </p>
              </div>

              {/* CHANGE LOCATION */}
              <div className="space-y-3">
                <p className="text-xs font-mono tracking-widest text-[#cf9f5d]">
                  CHANGE LOCATION
                </p>
                {(context?.venues || []).length === 0 && (
                  <p className="text-sm text-[#faf6f0]/60">No venue yet.</p>
                )}
                <div className="grid grid-cols-2 gap-2.5">
                  <button type="button" className="p-4 text-left border border-[#cf9f5d]/30 text-[#edd2ab]" onClick={() => setTargetVenueId(null)}>Not assigned yet</button>
                  {context?.venues.map((v) => {
                    const isSelected = targetVenueId === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setTargetVenueId(v.id)}
                        className={`p-4 text-left border transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-[#cf9f5d] bg-[#24040a] text-[#faf6f0]'
                            : 'border-[#cf9f5d]/25 bg-[#1a0206] text-[#edd2ab]/80 hover:border-[#cf9f5d]/60'
                        }`}
                      >
                        <p className="text-sm font-mono font-semibold uppercase">
                          {v.name}
                        </p>
                        <p className="text-[11px] text-[#faf6f0]/55 mt-0.5">
                          {v.floor}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* TIME & STATUS */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5">
                  <label className="block text-xs font-mono text-[#faf6f0]/55">
                    START TIME
                  </label>
                  <input
                    type="time"
                    aria-label="Session start time"
                    value={targetStartTime}
                    onChange={(e) => setTargetStartTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#1a0206] border border-[#cf9f5d]/30 text-[#faf6f0] tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-mono text-[#faf6f0]/55">
                    END TIME
                  </label>
                  <input
                    type="time"
                    aria-label="Session end time"
                    value={targetEndTime}
                    onChange={(e) => setTargetEndTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#1a0206] border border-[#cf9f5d]/30 text-[#faf6f0] tabular-nums"
                  />
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-[#cf9f5d]/20 flex items-center gap-3">
              <button
                type="submit"
                disabled={
                  updatingSession ||
                  !targetStartTime ||
                  !targetEndTime
                }
                className="flex-1 py-3.5 px-6 text-xs font-semibold tracking-widest bg-[#cf9f5d] text-[#0d0608] hover:bg-[#edd2ab] transition-colors cursor-pointer disabled:opacity-50"
              >
                {updatingSession ? 'UPDATING...' : 'UPDATE'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                className="py-3.5 px-5 text-xs border border-[#cf9f5d]/30 text-[#edd2ab] hover:bg-[#1a0206] cursor-pointer"
              >
                CANCEL
              </button>
            </div>
          </form>
        </div>
      )}
      </div>
    </div>
  );
};
