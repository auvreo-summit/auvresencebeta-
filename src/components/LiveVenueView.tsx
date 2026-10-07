import { PoiIcon } from './PoiIcon.tsx';
import React, { useState, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Check, Navigation, ArrowUpRight } from 'lucide-react';
import type {
  ComputedRouteStep,
  EventFullContext,
  UserProfile,
  VenueLocation,
} from '../types.ts';
import type { ActionArchitectureTrace } from './ActionXRayModal.tsx';

interface LiveVenueViewProps {
  user: UserProfile | null;
  authToken: string | null;
  context: EventFullContext | null;
  onRefreshContext: () => Promise<void>;
  onOpenAskAuvresence: (question?: string) => void;
  onSignInAsParticipant: () => Promise<string | null>;
  onRecordActionTrace?: (trace: ActionArchitectureTrace) => void;
  onBackToCompanion?: () => void;
  onOpenVenueStudio?: () => void;
}

function computeClientVenueRoute(
  venues: VenueLocation[],
  edges: EventFullContext['edges'],
  fromVenueId: number,
  toVenueId: number,
  accessibleOnly: boolean
): {
  steps: ComputedRouteStep[];
  totalDistanceMeters: number;
  estimatedMinutes: number;
  pathVenueIds: number[];
  // True when both places exist but the venue graph has no connected path.
  unreachable?: boolean;
} {
  const venueById = new Map(venues.map((v) => [v.id, v]));
  const start = venueById.get(fromVenueId);
  const target = venueById.get(toVenueId);
  if (!start || !target) {
    return {
      steps: [],
      totalDistanceMeters: 0,
      estimatedMinutes: 0,
      pathVenueIds: [],
    };
  }
  if (start.id === target.id) {
    return {
      steps: [
        {
          venueId: start.id,
          name: start.name,
          floor: start.floor,
          poiType: start.poiType,
          instruction: `Currently at ${start.name} (${start.floor} · ${start.zone})`,
        },
      ],
      totalDistanceMeters: 0,
      estimatedMinutes: 0,
      pathVenueIds: [start.id],
    };
  }

  const adj = new Map<number, Array<{ to: number; dist: number }>>();
  for (const edge of edges || []) {
    if (accessibleOnly && !edge.accessible) continue;
    const nodeA = venueById.get(edge.fromVenueId);
    const nodeB = venueById.get(edge.toVenueId);
    if (!nodeA || !nodeB) continue;
    if (
      edge.fromVenueId !== start.id &&
      edge.fromVenueId !== target.id &&
      nodeA.operationalStatus !== 'OPEN'
    ) {
      continue;
    }
    if (
      edge.toVenueId !== start.id &&
      edge.toVenueId !== target.id &&
      nodeB.operationalStatus !== 'OPEN'
    ) {
      continue;
    }
    if (accessibleOnly && (!nodeA.accessible || !nodeB.accessible)) {
      continue;
    }

    if (!adj.has(edge.fromVenueId)) adj.set(edge.fromVenueId, []);
    if (!adj.has(edge.toVenueId)) adj.set(edge.toVenueId, []);
    adj.get(edge.fromVenueId)!.push({
      to: edge.toVenueId,
      dist: edge.distanceMeters,
    });
    adj.get(edge.toVenueId)!.push({
      to: edge.fromVenueId,
      dist: edge.distanceMeters,
    });
  }

  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  const visited = new Set<number>();
  for (const v of venues) dist.set(v.id, Infinity);
  dist.set(start.id, 0);

  while (visited.size < venues.length) {
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
    for (const nb of adj.get(u) || []) {
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
    // Never invent a route: nothing connects these two places yet.
    return {
      steps: [],
      totalDistanceMeters: 0,
      estimatedMinutes: 0,
      pathVenueIds: [],
      unreachable: true,
    };
  }

  const pathIds: number[] = [];
  let curr: number | undefined = target.id;
  while (curr !== undefined) {
    pathIds.unshift(curr);
    curr = prev.get(curr);
  }

  const steps: ComputedRouteStep[] = pathIds.map((vid, idx) => {
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
      poiType: v.poiType,
      instruction,
    };
  });

  return {
    steps,
    totalDistanceMeters: totalDist,
    estimatedMinutes: Math.max(1, Math.round(totalDist / 55)),
    pathVenueIds: pathIds,
  };
}

export const LiveVenueView: React.FC<LiveVenueViewProps> = ({
  authToken,
  context,
  onRefreshContext,
  onOpenAskAuvresence,
  onSignInAsParticipant,
  onRecordActionTrace,
  onBackToCompanion,
  onOpenVenueStudio,
}) => {
  const [search, setSearch] = useState('');
  const [selectedVenueId, setSelectedVenueId] = useState<number | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<
    'ALL' | 'EVENT' | 'FOOD' | 'WASHROOM' | 'MEDICAL' | 'MOVEMENT'
  >('ALL');
  const [accessibleOnly, setAccessibleOnly] = useState<boolean>(false);
  const [fromVenueIdOverride, setFromVenueIdOverride] = useState<number | null>(
    null
  );
  const [scanningWaypoint, setScanningWaypoint] = useState(false);
  const [scanMessage, setScanMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  if (!context) {
    return (
      <div className="max-w-[1160px] mx-auto px-6 py-20 space-y-8">
        <div className="h-4 w-28 bg-[#1a0206] animate-pulse" />
        <div className="h-12 w-72 bg-[#1a0206] animate-pulse" />
        <div className="h-96 bg-[#1a0206] animate-pulse" />
      </div>
    );
  }

  const pulse = context.pulse;
  const nextDest = pulse.nextDestination;
  const currentVenue = pulse.happeningNow
    ? context.venues.find((v) => v.id === pulse.happeningNow?.venueId) || null
    : null;

  const defaultOriginVenue =
    (context.waypointTrail.length > 0
      ? context.venues.find(
          (v) =>
            v.id ===
            context.waypointTrail[context.waypointTrail.length - 1].venueId
        )
      : null) || null;

  const originVenue =
    context.venues.find((v) => v.id === fromVenueIdOverride) ||
    defaultOriginVenue;

  const activeVenue: VenueLocation | null =
    context.venues.find((v) => v.id === selectedVenueId) ||
    nextDest ||
    null;

  const floorOptions = useMemo(() => {
    const fromFloors = (context.floors || []).map((f) => f.name);
    const fromVenues = context.venues.map((v) => v.floor);
    return Array.from(new Set([...fromFloors, ...fromVenues]));
  }, [context.floors, context.venues]);

  const filteredVenues = useMemo(() => {
    return context.venues.filter((v) => {
      if (search.trim() && !`${v.name} ${v.shortDescription} ${v.floor} ${v.poiType}`.toLowerCase().includes(search.trim().toLowerCase())) return false;
      if (selectedFloor !== 'ALL' && v.floor !== selectedFloor) {
        const isConnectorOnFloor =
          (v.connectedFloors || []).includes(selectedFloor);
        if (!isConnectorOnFloor) return false;
      }
      if (categoryFilter === 'EVENT') return v.poiCategory === 'EVENT';
      if (categoryFilter === 'FOOD')
        return (
          v.poiType === 'FOOD' ||
          v.poiType === 'CAFE' ||
          v.poiType === 'WATER'
        );
      if (categoryFilter === 'WASHROOM') return v.poiType === 'WASHROOM';
      if (categoryFilter === 'MEDICAL')
        return v.poiType === 'MEDICAL' || v.poiType === 'HELP_DESK';
      if (categoryFilter === 'MOVEMENT') return v.poiCategory === 'MOVEMENT';
      return true;
    });
  }, [context.venues, selectedFloor, categoryFilter, search]);

  const activeRoute = useMemo(() => {
    if (!originVenue || !activeVenue) return null;
    return computeClientVenueRoute(
      context.venues,
      context.edges || [],
      originVenue.id,
      activeVenue.id,
      accessibleOnly
    );
  }, [context.venues, context.edges, originVenue, activeVenue, accessibleOnly]);

  const activeFloorObj = useMemo(() => {
    if (selectedFloor === 'ALL') return null;
    return (context.floors || []).find((f) => f.name === selectedFloor) || null;
  }, [context.floors, selectedFloor]);

  const handleQuickAmenitySelect = (
    type: 'FOOD' | 'WASHROOM' | 'MEDICAL' | 'LIFT'
  ) => {
    const match = context.venues.find((v) => {
      if (v.operationalStatus !== 'OPEN') return false;
      if (type === 'FOOD')
        return v.poiType === 'FOOD' || v.poiType === 'CAFE';
      if (type === 'WASHROOM') return v.poiType === 'WASHROOM';
      if (type === 'MEDICAL')
        return v.poiType === 'MEDICAL' || v.poiType === 'HELP_DESK';
      if (type === 'LIFT') return v.poiType === 'LIFT';
      return false;
    });
    if (match) {
      setSelectedVenueId(match.id);
      setSelectedFloor(match.floor);
      setCategoryFilter('ALL');
    }
  };

  const handleWaypointCheckIn = async (venue: VenueLocation) => {
    setScanningWaypoint(true);
    setScanMessage(null);
    try {
      let tokenToUse = authToken;
      if (!tokenToUse) {
        tokenToUse = await onSignInAsParticipant();
      }
      if (!tokenToUse) {
        throw new Error('Sign in required to check in at this location.');
      }

      const res = await fetch(
        `/api/events/${context.event.id}/venues/${venue.id}/checkin`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokenToUse}` },
        }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Could not record check-in.');
      }
      await onRefreshContext();
      setFromVenueIdOverride(venue.id);
      setScanMessage({
        type: 'success',
        text: `Checked in at ${venue.name} (${venue.floor}). Route origin updated.`,
      });
      if (onRecordActionTrace) {
        onRecordActionTrace({
          id: `waypoint-${Date.now()}`,
          title: `Waypoint Check-In · ${venue.name}`,
          subtitle: `${venue.floor} · ${venue.zone}`,
          timestamp: new Date().toLocaleTimeString(),
          steps: [
            {
              layer: 'PARTICIPANT WAYPOINT SCAN',
              detail: `POST /api/waypoints/scan (${venue.name})`,
            },
            {
              layer: 'IDENTITY & ACCEPTANCE CHECK',
              detail: `Verified participant holds ACCEPTED status for event #${context.event.id}.`,
            },
            {
              layer: 'DATABASE PERSISTENCE',
              detail: `Recorded arrival in waypoint_scans and updated live wayfinding origin.`,
            },
          ],
        });
      }
    } catch (err: any) {
      setScanMessage({
        type: 'error',
        text: err.message || 'Check-in failed.',
      });
    } finally {
      setScanningWaypoint(false);
    }
  };

  if (context.venues.length === 0) return (
    <section className="mx-auto max-w-3xl px-6 py-24 sm:py-32">
      <p className="text-xs font-mono tracking-[.3em] text-[#cf9f5d]">VENUE</p>
      <h1 className="mt-6 font-display text-5xl sm:text-6xl">{context.isOrganiser ? 'Your event needs a place.' : 'A place is taking shape.'}</h1>
      <p className="mt-6 text-[#edd2ab]">{context.isOrganiser ? 'Teach Auvresence your venue. Start with the places people need to find.' : 'Your organiser hasn’t published any places yet. Check back for the event map.'}</p>
      {context.isOrganiser && onOpenVenueStudio && <button type="button" className="auv-btn auv-btn-primary mt-8" onClick={onOpenVenueStudio}>Create venue <ArrowLeft className="h-4 w-4 rotate-180" /></button>}
      {onBackToCompanion && <button type="button" className="auv-btn auv-btn-text mt-8 ml-4" onClick={onBackToCompanion}>Back to event</button>}
    </section>
  );

  return (
    <div className="max-w-[1160px] mx-auto px-6 py-10 lg:py-14 space-y-12 pb-28 md:pb-16">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#cf9f5d]/15 pb-5">
        <div className="flex flex-wrap items-center gap-4">
          {onBackToCompanion && (
            <button
              type="button"
              onClick={onBackToCompanion}
              className="text-xs font-mono text-[#edd2ab]/75 hover:text-[#faf6f0] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              TODAY
            </button>
          )}
          <span className="text-xs font-mono tracking-widest text-[#cf9f5d] uppercase">
            VENUE
          </span>
          {context.event.venueName && (
            <span className="text-xs font-mono text-[#faf6f0]/60">
              · {context.event.venueName}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => onOpenAskAuvresence('Where do I go next?')}
          className="text-xs font-medium text-[#edd2ab] hover:text-[#faf6f0] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
        >
          <ArrowUpRight className="w-3.5 h-3.5 text-[#cf9f5d]" />
          Where do I go next?
        </button>
      </div>

      <div className="max-w-xl">
        <label htmlFor="venue-search" className="block text-xs font-mono tracking-widest text-[#cf9f5d] mb-3">FIND YOUR PLACE</label>
        <input id="venue-search" type="search" className="auv-input" placeholder="Search places, amenities, or floors" value={search} onChange={(e) => { setSearch(e.target.value); setSelectedFloor('ALL'); setCategoryFilter('ALL'); }} />
      </div>
      {/* YOUR NEXT DESTINATION HERO */}
      {nextDest && (
        <section className="grid lg:grid-cols-12 gap-8 items-end border-b border-[#cf9f5d]/20 pb-12">
          <div className="lg:col-span-8 space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono tracking-widest text-[#cf9f5d]">
              <span>YOUR NEXT DESTINATION</span>
              {pulse.upNext?.lastUpdatedNote && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#edd2ab] font-semibold">UPDATED</span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-baseline gap-4">
              <h1 className="text-4xl sm:text-6xl font-display font-normal text-[#faf6f0] tracking-tight uppercase">
                {nextDest.name}
              </h1>
            </div>

            <p className="text-lg font-display text-[#edd2ab]">
              {pulse.upNext?.title} ·{' '}
              <span className="font-mono text-sm tabular-nums">
                {pulse.upNext?.startTime}
              </span>
            </p>

            <p className="text-xs font-mono text-[#faf6f0]/60">
              {nextDest.floor} · {nextDest.zone}
            </p>
          </div>

          <div className="lg:col-span-4 flex flex-wrap lg:justify-end gap-3">
            <button
              type="button"
              onClick={() => setSelectedVenueId(nextDest.id)}
              className="px-5 py-3 text-xs font-semibold tracking-wider bg-[#cf9f5d] text-[#0d0608] hover:bg-[#edd2ab] transition-colors cursor-pointer whitespace-nowrap"
            >
              Route to {nextDest.name}
            </button>
            <button
              type="button"
              onClick={() => handleWaypointCheckIn(nextDest)}
              disabled={scanningWaypoint || context.myApplication?.status !== 'ACCEPTED'}
              className="px-5 py-3 text-xs font-medium border border-[#cf9f5d]/40 text-[#edd2ab] hover:bg-[#1a0206] transition-colors cursor-pointer whitespace-nowrap"
            >
              Check in
            </button>
          </div>
        </section>
      )}

      {/* FLOOR & AMENITY CONTROLS */}
      <div className="flex flex-wrap items-center justify-between gap-6 border-b border-[#cf9f5d]/15 pb-5">
        <div className="flex flex-wrap items-center gap-5">
          <span className="text-[11px] font-mono tracking-widest text-[#cf9f5d] uppercase">
            FLOOR
          </span>
          <button
            type="button"
            onClick={() => setSelectedFloor('ALL')}
            className={`text-xs font-mono uppercase pb-1 transition-colors cursor-pointer ${
              selectedFloor === 'ALL'
                ? 'text-[#faf6f0] border-b-2 border-[#cf9f5d]'
                : 'text-[#faf6f0]/55 hover:text-[#edd2ab]'
            }`}
          >
            All Floors
          </button>
          {floorOptions.map((fl) => (
            <button
              key={fl}
              type="button"
              onClick={() => setSelectedFloor(fl)}
              className={`text-xs font-mono uppercase pb-1 transition-colors cursor-pointer ${
                selectedFloor === fl
                  ? 'text-[#faf6f0] border-b-2 border-[#cf9f5d]'
                  : 'text-[#faf6f0]/55 hover:text-[#edd2ab]'
              }`}
            >
              {fl}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <span className="text-[11px] font-mono tracking-widest text-[#cf9f5d] uppercase">
            FIND
          </span>
          {context.venues.some(v => v.operationalStatus === 'OPEN' && (v.poiType === 'FOOD' || v.poiType === 'CAFE')) && (
          <button
            type="button"
            onClick={() => handleQuickAmenitySelect('FOOD')}
            className="text-xs font-mono text-[#edd2ab]/80 hover:text-[#faf6f0] underline underline-offset-4 decoration-[#cf9f5d]/40 cursor-pointer"
          >
            Food & Dining
          </button>
          )}
          {context.venues.some(v => v.operationalStatus === 'OPEN' && (v.poiType === 'WASHROOM')) && (
          <button
            type="button"
            onClick={() => handleQuickAmenitySelect('WASHROOM')}
            className="text-xs font-mono text-[#edd2ab]/80 hover:text-[#faf6f0] underline underline-offset-4 decoration-[#cf9f5d]/40 cursor-pointer"
          >
            Washrooms
          </button>
          )}
          {context.venues.some(v => v.operationalStatus === 'OPEN' && (v.poiType === 'MEDICAL' || v.poiType === 'HELP_DESK')) && (
          <button
            type="button"
            onClick={() => handleQuickAmenitySelect('MEDICAL')}
            className="text-xs font-mono text-[#edd2ab]/80 hover:text-[#faf6f0] underline underline-offset-4 decoration-[#cf9f5d]/40 cursor-pointer"
          >
            Medical & Help
          </button>
          )}
          <button
            type="button"
            onClick={() => setAccessibleOnly((prev) => !prev)}
            className={`px-3 py-1.5 text-[11px] font-mono tracking-wider uppercase border transition-colors cursor-pointer ${
              accessibleOnly
                ? 'bg-[#cf9f5d] text-[#0d0608] border-[#cf9f5d] font-semibold'
                : 'border-[#cf9f5d]/35 text-[#edd2ab] hover:border-[#cf9f5d]'
            }`}
          >
            {accessibleOnly ? 'Step-Free Active' : 'Step-Free Route'}
          </button>
        </div>
      </div>

      {/* SPATIAL VENUE DIRECTORY + INTERACTIVE FLOORPLATE */}
      <div className="grid lg:grid-cols-12 gap-12 items-start">
        {/* Left 7 Columns: Spatial Venue Tree & Interactive Floorplate */}
        <div className="lg:col-span-7 space-y-10">
          {/* Interactive Spatial Canvas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-[#edd2ab]/75">
              <span>
                {selectedFloor === 'ALL'
                  ? 'YOUR EVENT, MAPPED'
                  : `${selectedFloor.toUpperCase()}${
                      activeFloorObj?.description
                        ? ` · ${activeFloorObj.description}`
                        : ''
                    }`}
              </span>
              {activeRoute && activeRoute.steps.length > 1 && (
                <span className="text-[#cf9f5d] tabular-nums">
                  ~{activeRoute.totalDistanceMeters}m ·{' '}
                  {activeRoute.estimatedMinutes} min walk
                </span>
              )}
            </div>

            <div className="relative w-full h-[380px] bg-[#130307] border border-[#cf9f5d]/25 overflow-hidden select-none">
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

                {/* Recorded Walk-to-Map Floor Corridor Path */}
                {activeFloorObj &&
                  activeFloorObj.recordedPath &&
                  activeFloorObj.recordedPath.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="rgba(237, 210, 171, 0.25)"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={activeFloorObj.recordedPath
                        .map((pt) => `${pt.x},${pt.y}`)
                        .join(' ')}
                    />
                  )}

                {/* Connected Venue Graph Edges */}
                {(context.edges || []).map((edge) => {
                  const fromV = context.venues.find(
                    (v) => v.id === edge.fromVenueId
                  );
                  const toV = context.venues.find(
                    (v) => v.id === edge.toVenueId
                  );
                  if (!fromV || !toV) return null;
                  if (
                    selectedFloor !== 'ALL' &&
                    fromV.floor !== selectedFloor &&
                    toV.floor !== selectedFloor
                  ) {
                    return null;
                  }
                  const isOnActiveRoute =
                    activeRoute &&
                    activeRoute.pathVenueIds.includes(fromV.id) &&
                    activeRoute.pathVenueIds.includes(toV.id) &&
                    Math.abs(
                      activeRoute.pathVenueIds.indexOf(fromV.id) -
                        activeRoute.pathVenueIds.indexOf(toV.id)
                    ) === 1;

                  return (
                    <line
                      key={edge.id}
                      x1={fromV.mapX}
                      y1={fromV.mapY}
                      x2={toV.mapX}
                      y2={toV.mapY}
                      stroke={
                        isOnActiveRoute
                          ? '#cf9f5d'
                          : 'rgba(207, 159, 93, 0.18)'
                      }
                      strokeWidth={isOnActiveRoute ? '0.8' : '0.35'}
                      strokeDasharray={
                        isOnActiveRoute
                          ? '2,1'
                          : edge.isCrossFloor
                          ? '1,1.5'
                          : undefined
                      }
                    />
                  );
                })}
              </svg>

              {filteredVenues.map((v) => {
                const isNext = nextDest?.id === v.id;
                const isCurrent = currentVenue?.id === v.id;
                const isSelected = activeVenue?.id === v.id;
                const isOnRoute = activeRoute?.pathVenueIds.includes(v.id);
                const isClosed = v.operationalStatus !== 'OPEN';

                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVenueId(v.id)}
                    style={{
                      left: `${v.mapX}%`,
                      top: `${v.mapY}%`,
                    }}
                    aria-label={`${v.name}, ${v.floor}${v.operationalStatus !== 'OPEN' ? ', currently unavailable' : ''}`}
                    aria-pressed={isSelected}
                    className="absolute min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
                  >
                    <div className="flex flex-col items-center">
                      {isNext && (
                        <span className="mb-1 px-2 py-0.5 bg-[#cf9f5d] text-[#0d0608] text-[10px] font-mono font-semibold whitespace-nowrap">
                          NEXT
                        </span>
                      )}
                      {!isNext && isCurrent && (
                        <span className="mb-1 px-2 py-0.5 bg-emerald-400 text-[#0d0608] text-[10px] font-mono font-semibold whitespace-nowrap">
                          NOW
                        </span>
                      )}
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-[#0d0608] transition-colors ${
                          isClosed
                            ? 'bg-red-900/70 border border-red-400/60'
                            : isNext
                            ? 'bg-[#cf9f5d] ring-4 ring-[#cf9f5d]/30'
                            : isCurrent
                            ? 'bg-emerald-400 ring-4 ring-emerald-400/25'
                            : isSelected || isOnRoute
                            ? 'bg-[#edd2ab] ring-2 ring-[#cf9f5d]'
                            : 'bg-[#1a0206] text-[#edd2ab] border border-[#cf9f5d]/70'
                        }`}
                      ><PoiIcon type={v.poiType} /></div>
                      <span
                        className={`mt-1 px-1.5 py-0.5 text-[10px] font-mono whitespace-nowrap ${
                          isNext || isSelected
                            ? 'text-[#faf6f0] font-semibold bg-[#0d0608]/95 border border-[#cf9f5d]/50'
                            : isOnRoute
                            ? 'text-[#edd2ab] bg-[#0d0608]/90 border border-[#cf9f5d]/30'
                            : 'text-[#edd2ab]/75 bg-[#0d0608]/75'
                        }`}
                      >
                        {v.name}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Abstract Spatial Venue Directory (Connected Tree) */}
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-xs font-mono tracking-widest text-[#cf9f5d] uppercase">
                PLACES ({filteredVenues.length})
              </p>
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
                {(
                  [
                    ['ALL', 'All'],
                    ['EVENT', 'Event places'],
                    ['FOOD', 'Food'],
                    ['WASHROOM', 'Washrooms'],
                    ['MEDICAL', 'Medical & Help'],
                    ['MOVEMENT', 'Lifts & Stairs'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCategoryFilter(key)}
                    className={`cursor-pointer transition-colors ${
                      categoryFilter === key
                        ? 'text-[#cf9f5d] font-semibold'
                        : 'text-[#faf6f0]/50 hover:text-[#edd2ab]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-l border-[#cf9f5d]/30 pl-6 space-y-5">
              {filteredVenues.map((v) => {
                const isNext = nextDest?.id === v.id;
                const isNow = currentVenue?.id === v.id;
                const isSelected = activeVenue?.id === v.id;
                const isClosed = v.operationalStatus !== 'OPEN';

                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVenueId(v.id)}
                    className="group relative w-full text-left flex items-baseline justify-between gap-4 py-2 cursor-pointer"
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute -left-6 top-1/2 w-4 h-px transition-colors ${
                        isNext || isSelected
                          ? 'bg-[#cf9f5d]'
                          : 'bg-[#cf9f5d]/30 group-hover:bg-[#cf9f5d]/60'
                      }`}
                    />

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <span
                          className={`text-xl font-display tracking-wide uppercase transition-colors ${
                            isClosed
                              ? 'text-[#faf6f0]/40 line-through'
                              : isNext
                              ? 'text-[#faf6f0] font-semibold'
                              : isSelected
                              ? 'text-[#edd2ab]'
                              : 'text-[#faf6f0]/75 group-hover:text-[#faf6f0]'
                          }`}
                        >
                          {v.name}
                        </span>
                        <span className="text-xs font-mono text-[#faf6f0]/45">
                          {v.floor}
                        </span>
                        <span className="text-[11px] font-mono text-[#cf9f5d]/75 uppercase">
                          {v.poiType.replace('_', ' ')}
                        </span>
                        {!v.accessible && (
                          <span className="text-[10px] font-mono text-[#faf6f0]/40 uppercase">
                            Stairs only
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#faf6f0]/55">{v.zone}</p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {isClosed && (
                        <span className="text-[11px] font-mono text-red-300 uppercase">
                          {v.operationalStatus.replace('_', ' ')}
                        </span>
                      )}
                      {!isClosed && isNext && (
                        <span className="text-xs font-mono tracking-widest text-[#cf9f5d] font-semibold inline-flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#cf9f5d]" />
                          NEXT
                        </span>
                      )}
                      {!isClosed && !isNext && isNow && (
                        <span className="text-xs font-mono tracking-widest text-emerald-300 font-semibold inline-flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          NOW
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Active Location Detail, Multi-Floor Route & Check-In */}
        <div className="lg:col-span-5 space-y-10 lg:border-l lg:border-[#cf9f5d]/15 lg:pl-10">
          {activeVenue && (
            <div className="space-y-8">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-mono tracking-widest text-[#cf9f5d] uppercase">
                    {activeVenue.poiType.replace('_', ' ')} ·{' '}
                    {activeVenue.operationalStatus}
                  </p>
                  {activeVenue.accessible && (
                    <span className="text-[11px] font-mono text-[#edd2ab]/80 uppercase">
                      Step-free
                    </span>
                  )}
                </div>
                <h2 className="text-3xl font-display font-normal text-[#faf6f0] uppercase">
                  {activeVenue.name}
                </h2>
                <p className="text-xs font-mono text-[#edd2ab]">
                  {activeVenue.floor} · {activeVenue.zone}
                </p>
                <p className="text-sm text-[#faf6f0]/75 pt-2 leading-relaxed">
                  {activeVenue.shortDescription}
                </p>
              </div>

              {!originVenue && <div className="border-y border-[#cf9f5d]/20 py-6 space-y-3"><p className="text-sm text-[#edd2ab]">Choose a starting place to view a route. Your current location is not tracked.</p><label className="block text-xs text-[#edd2ab]">Route starting place<select aria-label="Route starting place" value="" onChange={e => setFromVenueIdOverride(Number(e.target.value))} className="auv-input mt-2"><option value="">Choose a place</option>{context.venues.map(v => <option key={v.id} value={v.id}>{v.name} ({v.floor})</option>)}</select></label></div>}
              {activeRoute?.unreachable && (
                <div
                  role="status"
                  className="border-t border-b border-[#cf9f5d]/20 py-6 space-y-3"
                >
                  <p className="text-lg font-display text-[#faf6f0]">
                    Route unavailable
                  </p>
                  <p className="text-sm text-[#faf6f0]/65">
                    This path hasn&apos;t been connected yet.
                  </p>
                  <label className="flex items-center gap-2 text-xs text-[#edd2ab]/75">
                    From
                    <select
                      value={originVenue?.id || ''}
                      onChange={(e) =>
                        setFromVenueIdOverride(Number(e.target.value))
                      }
                      className="bg-[#1a0206] border border-[#cf9f5d]/30 text-[#faf6f0] px-2 py-1 text-xs focus:outline-none focus:border-[#cf9f5d]"
                    >
                      {context.venues.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.floor})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {/* STEP-BY-STEP MULTI-FLOOR WAYFINDING */}
              {activeRoute && activeRoute.steps.length > 0 && (
                <div className="border-t border-b border-[#cf9f5d]/20 py-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-mono tracking-widest text-[#cf9f5d] uppercase">
                      ROUTE GUIDANCE
                    </span>
                    <div className="flex items-center gap-2 text-xs font-mono text-[#edd2ab]/75">
                      <span>From:</span>
                      <select
                        value={originVenue?.id || ''}
                        onChange={(e) =>
                          setFromVenueIdOverride(Number(e.target.value))
                        }
                        className="bg-[#1a0206] border border-[#cf9f5d]/30 text-[#faf6f0] px-2 py-1 text-xs font-mono focus:outline-none focus:border-[#cf9f5d]"
                      >
                        {context.venues.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} ({v.floor})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-3 pl-4 border-l border-[#cf9f5d]/35">
                    {activeRoute.steps.map((step, idx) => (
                      <div key={`${step.venueId}-${idx}`} className="space-y-0.5">
                        <p className="text-[11px] font-mono text-[#cf9f5d] uppercase">
                          STEP {idx + 1} · {step.floor}
                        </p>
                        <p className="text-sm text-[#faf6f0]">
                          {step.instruction}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {scanMessage && (
                <div className="p-4 border border-[#cf9f5d]/40 bg-[#1a0206] text-xs text-[#faf6f0]">
                  {scanMessage.text}
                </div>
              )}

              {context.isOrganiser && activeVenue.waypointToken && <div className="bg-[#faf6f0] p-5 flex items-center gap-5 max-w-sm">
                <QRCodeSVG
                  value={`${window.location.origin}/waypoint/${activeVenue.waypointToken}`}
                  size={84}
                  bgColor="#faf6f0"
                  fgColor="#0d0608"
                  level="M"
                />
                <div className="text-[#0d0608] space-y-1">
                  <p className="text-xs font-mono font-semibold uppercase">
                    {activeVenue.name}
                  </p>
                  <p className="text-[11px] text-[#0d0608]/75 leading-snug">
                    Organiser check-in code. Print this at the entrance.
                  </p>
                </div>
              </div>}

              <button
                type="button"
                onClick={() => handleWaypointCheckIn(activeVenue)}
                disabled={scanningWaypoint || context.myApplication?.status !== 'ACCEPTED'}
                className="px-6 py-3 text-xs font-semibold tracking-wider bg-[#cf9f5d] text-[#0d0608] hover:bg-[#edd2ab] transition-colors inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Navigation className="w-3.5 h-3.5" />
                {scanningWaypoint
                  ? 'Checking in...'
                  : `Check in at ${activeVenue.name}`}
              </button>
            </div>
          )}

          {/* Visited Locations */}
          <div className="pt-8 border-t border-[#cf9f5d]/15 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono tracking-widest text-[#cf9f5d] uppercase">
                CHECKED IN
              </span>
              <span className="text-xs font-mono text-[#edd2ab]/70 tabular-nums">
                {context.waypointTrail.length}
              </span>
            </div>

            {context.waypointTrail.length === 0 ? (
              <p className="text-xs text-[#faf6f0]/55">
                No room check-ins recorded yet today.
              </p>
            ) : (
              <div className="divide-y divide-[#cf9f5d]/15">
                {context.waypointTrail.map((entry) => (
                  <div
                    key={entry.id}
                    className="py-3 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <Check className="w-3.5 h-3.5 text-[#cf9f5d]" />
                      <span className="text-[#faf6f0] font-medium">
                        {entry.venueName}
                      </span>
                      <span className="text-[#faf6f0]/50">
                        · {entry.venueFloor}
                      </span>
                    </div>
                    <span className="font-mono text-[#edd2ab]/75 tabular-nums">
                      {entry.scannedAt
                        ? new Date(entry.scannedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
