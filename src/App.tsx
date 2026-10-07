import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onIdTokenChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import { ArrowUpRight } from 'lucide-react';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import type {
  EventFullContext,
  EventSummary,
  UserJourneysData,
  UserProfile,
} from './types.ts';
import { EntryCanvas } from './components/EntryCanvas.tsx';
import { CreateEventView } from './components/CreateEventView.tsx';
import { ExploreView } from './components/ExploreView.tsx';
import { ProfileMenu } from './components/ProfileMenu.tsx';
import {
  ParticipantView,
  type ParticipantSubTab,
} from './components/ParticipantView.tsx';
import {
  OrganiserView,
  type OrganiserTab,
} from './components/OrganiserView.tsx';
import { LiveVenueView } from './components/LiveVenueView.tsx';
import { SecurityInspectorView } from './components/SecurityInspectorView.tsx';
import { ArchitectureView } from './components/ArchitectureView.tsx';
import { AskAuvresenceDrawer } from './components/AskAuvresenceDrawer.tsx';
import {
  VerificationView,
  WaypointRouteView,
} from './components/VerificationView.tsx';
import {
  JudgeModeBar,
  type SystemHealthStatus,
} from './components/JudgeModeBar.tsx';
import {
  ActionXRayModal,
  type ActionArchitectureTrace,
} from './components/ActionXRayModal.tsx';

type NavSurface =
  | 'ENTRY' // signed-out entrance canvas / signed-in Home
  | 'EXPLORE'
  | 'CREATE'
  | 'EXPERIENCE'
  | 'ORGANISE'
  | 'LIVE'
  | 'SECURITY'
  | 'ARCHITECTURE';

type AuthMode = 'FIREBASE' | 'PARTICIPANT_A' | 'ORGANISER_B';

// ---------------------------------------------------------------------------
// Tiny path router so a reload restores where the person was
//   /                 entrance / Home
//   /explore          public events
//   /create           organise an event
//   /studio/:eventId  Organiser Studio for that event
//   /event/:eventId   participant event space
// ---------------------------------------------------------------------------
type Route =
  | { surface: 'ENTRY' }
  | { surface: 'EXPLORE' }
  | { surface: 'CREATE' }
  | { surface: 'ORGANISE'; eventId: number }
  | { surface: 'EXPERIENCE'; eventId: number };

function parsePath(pathname: string): Route {
  if (pathname === '/explore') return { surface: 'EXPLORE' };
  if (pathname === '/create') return { surface: 'CREATE' };
  const studio = pathname.match(/^\/studio\/(\d+)$/);
  if (studio) return { surface: 'ORGANISE', eventId: Number(studio[1]) };
  const ev = pathname.match(/^\/event\/(\d+)$/);
  if (ev) return { surface: 'EXPERIENCE', eventId: Number(ev[1]) };
  return { surface: 'ENTRY' };
}

function pathFor(surface: NavSurface, eventId: number | null): string {
  switch (surface) {
    case 'EXPLORE':
      return '/explore';
    case 'CREATE':
      return '/create';
    case 'ORGANISE':
      return eventId ? `/studio/${eventId}` : '/';
    case 'LIVE':
    case 'EXPERIENCE':
      return eventId ? `/event/${eventId}` : '/';
    default:
      return '/';
  }
}

const SIGN_IN_ERRORS: Record<string, string> = {
  'auth/unauthorized-domain':
    'This domain is not authorised for Google sign-in. Add it under Firebase → Authentication → Settings → Authorised domains.',
  'auth/operation-not-allowed':
    'Google sign-in is not enabled for this Firebase project.',
  'auth/network-request-failed':
    'Could not reach Google. Check your connection and try again.',
};

export default function App() {
  const initialRoute = useRef<Route>(parsePath(window.location.pathname));

  // ---- Identity ----------------------------------------------------------
  const [authReady, setAuthReady] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const showcaseTokenRef = useRef<string | null>(null);
  const authModeRef = useRef<AuthMode | null>(null);
  authModeRef.current = authMode;
  const signedUidRef = useRef<string | null>(null);
  const pendingIntentRef = useRef<'ORGANISE' | null>(null);

  // ---- Navigation / data -------------------------------------------------
  const [activeSurface, setActiveSurface] = useState<NavSurface>('ENTRY');
  const [publicEvents, setPublicEvents] = useState<EventSummary[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [journeys, setJourneys] = useState<UserJourneysData | null>(null);
  const [journeysLoading, setJourneysLoading] = useState(false);
  const [journeysError, setJourneysError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [context, setContext] = useState<EventFullContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [createPrefill, setCreatePrefill] = useState<string | undefined>();

  const [participantSubTab, setParticipantSubTab] =
    useState<ParticipantSubTab>('TODAY');
  const [organiserSubTab, setOrganiserSubTab] =
    useState<OrganiserTab>('OVERVIEW');

  // ---- Judge / Technovate (kept, untouched in Phase 1) -------------------
  const [judgeModeOpen, setJudgeModeOpen] = useState(false);
  const [health, setHealth] = useState<SystemHealthStatus | null>(null);
  const [activeDemoStep, setActiveDemoStep] = useState<number>(1);
  const [lastTrace, setLastTrace] = useState<ActionArchitectureTrace | null>(
    null
  );
  const [xRayOpen, setXRayOpen] = useState(false);

  // ---- Ask Auvresence drawer (only inside the product) -------------------
  const [askDrawerOpen, setAskDrawerOpen] = useState(false);
  const [askInitialQuestion, setAskInitialQuestion] = useState<
    string | undefined
  >(undefined);

  // ---- QR routes ---------------------------------------------------------
  const [routeVerifyToken, setRouteVerifyToken] = useState<string | null>(null);
  const [routeWaypointToken, setRouteWaypointToken] = useState<string | null>(
    null
  );

  useEffect(() => {
    const checkPath = () => {
      const p = window.location.pathname;
      if (p.startsWith('/verify/')) {
        const t = decodeURIComponent(p.slice('/verify/'.length));
        if (t) setRouteVerifyToken(t);
      } else if (p.startsWith('/waypoint/')) {
        const t = decodeURIComponent(p.slice('/waypoint/'.length));
        if (t) setRouteWaypointToken(t);
      } else {
        setRouteVerifyToken(null);
        setRouteWaypointToken(null);
      }
    };
    checkPath();
    window.addEventListener('popstate', checkPath);
    return () => window.removeEventListener('popstate', checkPath);
  }, []);

  // ---- Token access ------------------------------------------------------
  /** Always returns a fresh token for whichever identity is active. */
  const getToken = useCallback(async (): Promise<string | null> => {
    if (authModeRef.current === 'FIREBASE') {
      return auth.currentUser ? await auth.currentUser.getIdToken() : null;
    }
    return showcaseTokenRef.current;
  }, []);

  // ---- Data loaders ------------------------------------------------------
  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      setHealth(await res.json());
    } catch {
      /* transient */
    }
  }, []);

  const fetchPublicEvents = useCallback(async () => {
    setEventsLoading(true);
    setEventsError(null);
    try {
      const res = await fetch('/api/events');
      if (!res.ok) throw new Error('Events are temporarily unavailable. Please try again.');
      const json = await res.json();
      setPublicEvents(Array.isArray(json.events) ? json.events : []);
    } catch (err) {
      setEventsError('We couldn’t load events. Please try again.');
    } finally {
      setEventsLoading(false);
    }
  }, []);

  const fetchJourneys = useCallback(async (tokenOverride?: string | null) => {
    const t = tokenOverride ?? (await getToken());
    if (!t) return;
    setJourneysLoading(true);
    setJourneysError(null);
    try {
      const res = await fetch('/api/me/journeys', {
        headers: { Authorization: `Bearer ${t}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load journeys.');
      if (t !== await getToken()) return;
      setJourneys(json);
    } catch (err: any) {
      setJourneysError(err.message || 'Could not load your journeys.');
    } finally {
      setJourneysLoading(false);
    }
  }, [getToken]);

  const fetchEventContext = useCallback(
    async (eventIdOverride?: number | null, tokenOverride?: string | null) => {
      const targetEventId = eventIdOverride ?? selectedEventId;
      if (!targetEventId) return;
      const t = tokenOverride !== undefined ? tokenOverride : await getToken();
      try {
        const headers: Record<string, string> = {};
        if (t) headers.Authorization = `Bearer ${t}`;
        const res = await fetch(`/api/events/${targetEventId}/context`, {
          headers,
        });
        if (res.ok) {
          const data: EventFullContext = await res.json();
          if (t !== await getToken()) return;
          setContext(data);
          setContextError(null);
        } else if (res.status === 404) {
          setContext(null);
          setContextError('This event could not be found.');
        } else {
          setContextError('Could not load this event.');
        }
      } catch (err) {
        console.error('Failed to load event context:', err);
        setContextError('Could not load this event.');
      }
    },
    [selectedEventId, getToken]
  );

  // ---- Navigation --------------------------------------------------------
  const navigate = useCallback(
    (
      surface: NavSurface,
      opts?: { eventId?: number | null; replace?: boolean }
    ) => {
      const eventId =
        opts && 'eventId' in opts ? opts.eventId ?? null : selectedEventId;
      setActiveSurface(surface);
      setAskDrawerOpen(false);
      const path = pathFor(surface, eventId);
      if (window.location.pathname !== path) {
        if (opts?.replace) window.history.replaceState({}, '', path);
        else window.history.pushState({}, '', path);
      }
      window.scrollTo({ top: 0 });
    },
    [selectedEventId]
  );

  const goHome = useCallback(() => {
    navigate('ENTRY', { eventId: null });
    if (authModeRef.current) fetchJourneys();
  }, [navigate, fetchJourneys]);

  const openStudio = useCallback(
    async (eventId: number) => {
      setContext(null);
      setContextError(null);
      setSelectedEventId(eventId);
      setOrganiserSubTab('OVERVIEW');
      navigate('ORGANISE', { eventId });
      await fetchEventContext(eventId);
    },
    [navigate, fetchEventContext]
  );

  const openEventSpace = useCallback(
    async (eventId: number, tab: ParticipantSubTab = 'TODAY') => {
      setContext(null);
      setContextError(null);
      setSelectedEventId(eventId);
      setParticipantSubTab(tab);
      navigate('EXPERIENCE', { eventId });
      await fetchEventContext(eventId);
    },
    [navigate, fetchEventContext]
  );

  // ---- Identity sync -----------------------------------------------------
  const syncFirebaseUser = useCallback(
    async (fbUser: FirebaseUser): Promise<string | null> => {
      const idToken = await fbUser.getIdToken();
      const res = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Profile sync failed (${res.status}).`);
      }
      const data = await res.json();
      if (auth.currentUser?.uid !== fbUser.uid) return null;
      if (signedUidRef.current && signedUidRef.current !== fbUser.uid) { setContext(null); setJourneys(null); }
      signedUidRef.current = fbUser.uid;
      authModeRef.current = 'FIREBASE';
      setAuthToken(idToken);
      setUser(data.user);
      setPhotoURL(fbUser.photoURL);
      setAuthMode('FIREBASE');
      setAuthError(null);
      return idToken;
    },
    []
  );

  // First paint waits for Firebase to restore (or not restore) a session, so
  // the entrance never flashes the wrong state. NO identity is ever invented.
  useEffect(() => {
    let cancelled = false;
    if (sessionStorage.getItem('auvresence-sign-in-intent') === 'ORGANISE') pendingIntentRef.current = 'ORGANISE';
    void getRedirectResult(auth).catch((error) => { if (!cancelled) setAuthError(SIGN_IN_ERRORS[error?.code] || 'Google sign-in did not complete.'); });
    const unsub = onIdTokenChanged(auth, async (fbUser) => {
      if (cancelled) return;
      try {
        if (fbUser) {
          // A judge-activated showcase identity must not be silently replaced.
          if (
            authModeRef.current === 'PARTICIPANT_A' ||
            authModeRef.current === 'ORGANISER_B'
          ) {
            return;
          }
          if (signedUidRef.current === fbUser.uid && authModeRef.current === 'FIREBASE') {
            // Hourly token refresh — just rotate the token.
            setAuthToken(await fbUser.getIdToken());
            return;
          }
          const t = await syncFirebaseUser(fbUser);
          if (cancelled) return;
          fetchJourneys(t);

          // Restore the page the person was on (reload persistence)
          const r = initialRoute.current;
          initialRoute.current = { surface: 'ENTRY' };
          if (pendingIntentRef.current === 'ORGANISE') {
            pendingIntentRef.current = null;
            sessionStorage.removeItem('auvresence-sign-in-intent');
            navigate('CREATE', { eventId: null });
          } else if (r.surface === 'ORGANISE') {
            await openStudio(r.eventId);
          } else if (r.surface === 'EXPERIENCE') {
            await openEventSpace(r.eventId);
          } else if (r.surface === 'CREATE' || r.surface === 'EXPLORE') {
            navigate(r.surface, { eventId: null, replace: true });
          }
        } else if (
          authModeRef.current === 'FIREBASE' ||
          authModeRef.current === null
        ) {
          signedUidRef.current = null;
          authModeRef.current = null;
          setAuthToken(null);
          setUser(null);
          setPhotoURL(null);
          setAuthMode(null);
          setJourneys(null);
          // Signed out: protected deep links fall back to the entrance
          const r = initialRoute.current;
          initialRoute.current = { surface: 'ENTRY' };
          if (r.surface === 'EXPERIENCE') await openEventSpace(r.eventId, 'DISCOVERY');
          else if (r.surface === 'EXPLORE') navigate('EXPLORE', { eventId: null, replace: true });
          else if (window.location.pathname !== '/' && !/^\/(verify|waypoint)\//.test(window.location.pathname) && r.surface !== 'ENTRY') {
            navigate('ENTRY', { eventId: null, replace: true });
          }
        }
      } catch (err: any) {
        console.error('Error syncing Firebase user:', err);
        setAuthError(
          err.message || 'You are signed in with Google, but your profile could not be loaded. Please retry.'
        );
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchHealth();
    fetchPublicEvents();
  }, [fetchHealth, fetchPublicEvents]);

  // Browser back/forward
  useEffect(() => {
    const onPop = () => {
      const r = parsePath(window.location.pathname);
      if (/^\/(verify|waypoint)\//.test(window.location.pathname)) return;
      if (r.surface === 'ORGANISE' || r.surface === 'EXPERIENCE') {
        setSelectedEventId(r.eventId);
        setContext(null);
        setContextError(null);
        setActiveSurface(r.surface);
        fetchEventContext(r.eventId);
      } else {
        setActiveSurface(r.surface);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [fetchEventContext]);

  // Keep a live event fresh while it's on screen
  useEffect(() => {
    if (
      activeSurface === 'EXPERIENCE' ||
      activeSurface === 'ORGANISE' ||
      activeSurface === 'LIVE'
    ) {
      const interval = setInterval(() => fetchEventContext(), 6000);
      return () => clearInterval(interval);
    }
  }, [activeSurface, fetchEventContext]);

  // ---- Auth actions ------------------------------------------------------
  const handleSignIn = useCallback(
    async (intent?: 'ORGANISE'): Promise<string | null> => {
      setAuthError(null);
      setSigningIn(true);
      pendingIntentRef.current = intent ?? null;
      try {
        if (auth.currentUser) {
          const token = await syncFirebaseUser(auth.currentUser);
          await fetchJourneys(token);
          if (intent === 'ORGANISE') { pendingIntentRef.current = null; navigate('CREATE', { eventId: null }); }
          return token;
        }
        const cred = await signInWithPopup(auth, googleAuthProvider);
        return await cred.user.getIdToken();
      } catch (err: any) {
        pendingIntentRef.current = null;
        const code: string = err?.code || '';
        if (
          code === 'auth/popup-closed-by-user' ||
          code === 'auth/cancelled-popup-request'
        ) {
          return null; // person changed their mind
        }
        if (code === 'auth/popup-blocked') {
          try {
            pendingIntentRef.current = intent ?? null;
            if (intent) sessionStorage.setItem('auvresence-sign-in-intent', intent);
            await signInWithRedirect(auth, googleAuthProvider);
            return null;
          } catch (e: any) {
            setAuthError(SIGN_IN_ERRORS[e?.code] || 'Sign-in could not start.');
            return null;
          }
        }
        console.error('Google sign-in failed:', err);
        setAuthError(
          SIGN_IN_ERRORS[code] || 'Google sign-in did not complete. Please try again.'
        );
        return null;
      } finally {
        setSigningIn(false);
      }
    },
    []
  );

  /** For child views that need a token and have none: real sign-in, no fakes. */
  const requestSignIn = useCallback(async (): Promise<string | null> => {
    const existing = await getToken();
    if (existing) return existing;
    return handleSignIn();
  }, [getToken, handleSignIn]);

  const resetToSignedOut = useCallback(() => {
    signedUidRef.current = null;
    showcaseTokenRef.current = null;
    authModeRef.current = null;
    setAuthToken(null);
    setUser(null);
    setPhotoURL(null);
    setAuthMode(null);
    setJourneys(null);
    setContext(null);
    setSelectedEventId(null);
    setJudgeModeOpen(false);
    navigate('ENTRY', { eventId: null });
  }, [navigate]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut(auth);
      resetToSignedOut();
    } catch (err) {
      console.error('Sign-out failed:', err);
      setAuthError('Sign-out did not complete. Please try again.');
    }
  }, [resetToSignedOut]);

  // ---- Judge-only identity switching (explicit, labelled, reversible) ----
  const activateShowcaseAccount = useCallback(
    async (account: 'PARTICIPANT_A' | 'ORGANISER_B'): Promise<string | null> => {
      try {
        const res = await fetch('/api/auth/demo-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account }),
        });
        const json = await res.json();
        if (res.ok && json.token) {
          setContext(null);
          setJourneys(null);
          showcaseTokenRef.current = json.token;
          authModeRef.current = account;
          setAuthToken(json.token);
          setUser(json.user);
          setPhotoURL(null);
          setAuthMode(account);
          const list = await fetch('/api/events').then((r) => r.json());
          const showcaseEvent = list.events?.find((event: EventSummary) => event.isDemoSeed);
          if (showcaseEvent) {
            setSelectedEventId(showcaseEvent.id);
            await fetchEventContext(showcaseEvent.id, json.token);
          }
          await fetchJourneys(json.token);
          return json.token;
        }
      } catch (err) {
        console.error('Failed to activate showcase account:', err);
      }
      return null;
    },
    [fetchEventContext, fetchJourneys]
  );

  const exitShowcaseIdentity = useCallback(async () => {
    showcaseTokenRef.current = null;
    authModeRef.current = null;
    setAuthMode(null);
    signedUidRef.current = null;
    if (auth.currentUser) {
      try {
        const t = await syncFirebaseUser(auth.currentUser);
        fetchJourneys(t);
        setContext(null);
        setSelectedEventId(null);
        navigate('ENTRY', { eventId: null });
        return;
      } catch {
        /* fall through to signed-out */
      }
    }
    resetToSignedOut();
  }, [syncFirebaseUser, fetchJourneys, resetToSignedOut, navigate]);

  const handleResetGoldenPath = async (
    mode: 'STEP_1_UNAPPLIED' | 'ACCEPTED_READY'
  ) => {
    try {
      let tokenToUse = await getToken();
      if (!tokenToUse || authMode === 'FIREBASE') {
        tokenToUse = await activateShowcaseAccount('PARTICIPANT_A');
      }
      if (!tokenToUse) return;
      await fetch('/api/demo/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenToUse}`,
        },
        body: JSON.stringify({ mode }),
      });
      await fetchEventContext(undefined, tokenToUse);
    } catch (err) {
      console.error('Failed to reset golden path:', err);
    }
  };

  const showcaseEventId = () =>
    publicEvents.find((e) => e.slug === 'auvreo-youth-summit-2026')?.id ??
    publicEvents.find((e) => e.isDemoSeed)?.id ??
    null;

  const openShowcaseEvent = async (
    account: 'PARTICIPANT_A' | 'ORGANISER_B',
    surface: 'EXPERIENCE' | 'ORGANISE',
    tab?: ParticipantSubTab | OrganiserTab
  ) => {
    const id = showcaseEventId();
    await activateShowcaseAccount(account);
    if (!id) return;
    if (surface === 'EXPERIENCE') {
      await openEventSpace(id, (tab as ParticipantSubTab) || 'TODAY');
    } else {
      await openStudio(id);
      if (tab) setOrganiserSubTab(tab as OrganiserTab);
    }
  };

  const handleSelectDemoStep = async (stepId: number) => {
    setActiveDemoStep(stepId);
    if (stepId === 1) await openShowcaseEvent('PARTICIPANT_A', 'EXPERIENCE', 'DISCOVERY');
    else if (stepId === 2 || stepId === 3)
      await openShowcaseEvent('ORGANISER_B', 'ORGANISE', 'APPLICATIONS');
    else if (stepId === 4)
      await openShowcaseEvent('PARTICIPANT_A', 'EXPERIENCE', 'CREDENTIAL');
    else if (stepId === 5)
      await openShowcaseEvent('ORGANISER_B', 'ORGANISE', 'SCHEDULE');
    else if (stepId === 6) {
      await openShowcaseEvent('PARTICIPANT_A', 'EXPERIENCE', 'TODAY');
      setAskInitialQuestion('Where do I go next?');
      setAskDrawerOpen(true);
    } else if (stepId === 7) navigate('SECURITY');
  };

  const handleStartTwoMinDemo = async () => {
    const token = await activateShowcaseAccount('PARTICIPANT_A');
    if (token) {
      await fetch('/api/demo/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mode: 'STEP_1_UNAPPLIED' }),
      });
    }
    setActiveDemoStep(1);
    await openShowcaseEvent('PARTICIPANT_A', 'EXPERIENCE', 'DISCOVERY');
  };

  const handleNextDemoStep = async () => {
    const next = activeDemoStep < 7 ? activeDemoStep + 1 : 1;
    await handleSelectDemoStep(next);
  };

  const handleRecordActionTrace = useCallback(
    (trace: ActionArchitectureTrace) => setLastTrace(trace),
    []
  );

  const handleOpenAskAuvresence = (question?: string) => {
    setAskInitialQuestion(question);
    setAskDrawerOpen(true);
  };

  const handleOpenVerificationPreview = (token: string) => {
    window.history.pushState({}, '', `/verify/${encodeURIComponent(token)}`);
    setRouteVerifyToken(token);
  };

  // ---- Dedicated QR routes ----------------------------------------------
  if (routeVerifyToken) {
    return (
      <VerificationView
        token={routeVerifyToken}
        onBackToApp={() => {
          setRouteVerifyToken(null);
          navigate('ENTRY', { eventId: null });
        }}
      />
    );
  }

  if (routeWaypointToken) {
    return (
      <WaypointRouteView
        waypointToken={routeWaypointToken}
        authToken={authToken}
        onSignInAsParticipant={requestSignIn}
        onReturnToLive={() => {
          window.history.pushState({}, '', '/');
          setRouteWaypointToken(null);
          setActiveSurface('LIVE');
          fetchEventContext();
        }}
      />
    );
  }

  // ---- Waiting for Firebase to restore a session -------------------------
  if (!authReady) {
    return (
      <div
        data-testid="auth-restoring"
        className="min-h-screen bg-[#0d0608] flex items-center justify-center"
      >
        <span className="font-display text-sm tracking-[0.34em] text-[#edd2ab]/70 animate-pulse">
          AUVRESENCE
        </span>
      </div>
    );
  }

  // ---- THE ENTRANCE / HOME ----------------------------------------------
  if (activeSurface === 'ENTRY') {
    return (
      <EntryCanvas
        user={user}
        getToken={getToken}
        aiConfigured={health?.aiConfigured}
        photoURL={photoURL}
        journeys={journeys}
        journeysLoading={journeysLoading}
        journeysError={journeysError}
        signingIn={signingIn}
        authError={authError}
        onSignIn={(intent) => {
          void handleSignIn(intent);
        }}
        onSignOut={handleSignOut}
        onOrganise={(prefill) => {
          setCreatePrefill(prefill?.description);
          navigate('CREATE', { eventId: null });
        }}
        onExplore={() => navigate('EXPLORE', { eventId: null })}
        onOpenParticipating={(id) => openEventSpace(id, 'TODAY')}
        onOpenOrganising={(id) => openStudio(id)}
        onRetryJourneys={() => fetchJourneys()}
      />
    );
  }

  // ---- INSIDE THE PRODUCT ------------------------------------------------
  const inEvent =
    activeSurface === 'EXPERIENCE' ||
    activeSurface === 'ORGANISE' ||
    activeSurface === 'LIVE';
  const contextReady = Boolean(
    context && selectedEventId && context.event.id === selectedEventId
  );
  const isDemoIdentity = authMode === 'PARTICIPANT_A' || authMode === 'ORGANISER_B';

  const navBtn = (active: boolean) =>
    `py-1 transition-colors cursor-pointer whitespace-nowrap ${
      active
        ? 'text-[#cf9f5d] border-b border-[#cf9f5d] font-semibold'
        : 'text-[#faf6f0]/65 hover:text-[#faf6f0]'
    }`;

  const eventGate = (children: React.ReactNode) => {
    if (contextError && !contextReady) {
      return (
        <div className="max-w-xl mx-auto px-6 py-32 text-center space-y-6">
          <p className="font-display text-3xl">{contextError}</p>
          <button
            type="button"
            onClick={goHome}
            className="text-xs tracking-[0.22em] uppercase text-[#edd2ab] border-b border-[#cf9f5d]/60 pb-1 cursor-pointer"
          >
            Back to Home
          </button>
        </div>
      );
    }
    if (!contextReady) {
      return (
        <div
          data-testid="event-loading" role="status" aria-label="Loading event"
          className="max-w-3xl mx-auto px-6 py-20 space-y-6"
        >
          <div className="auv-skeleton h-5 w-32" /><div className="auv-skeleton h-14 w-3/4" /><div className="auv-skeleton h-48 w-full" />
        </div>
      );
    }
    return children;
  };

  return (
    <div className="min-h-screen bg-[#0d0608] text-[#faf6f0] flex flex-col justify-between">
      <header className="sticky top-0 z-40 bg-[#0d0608]/90 backdrop-blur-xs border-b border-[#cf9f5d]/15 px-6 py-4 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={goHome}
          className="text-sm sm:text-lg font-display font-semibold tracking-[0.18em] sm:tracking-[0.26em] text-[#faf6f0] hover:text-[#edd2ab] transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          AUVRESENCE
        </button>

        <nav className="hidden md:flex items-center gap-8 text-xs tracking-widest uppercase">
          <button type="button" onClick={goHome} className={navBtn(false)}>
            Home
          </button>
          <button
            type="button"
            onClick={() => navigate('EXPLORE', { eventId: null })}
            className={navBtn(activeSurface === 'EXPLORE')}
          >
            Explore
          </button>
          {user && (
            <button
              type="button"
              data-testid="nav-organise"
              onClick={() => {
                setCreatePrefill(undefined);
                navigate('CREATE', { eventId: null });
              }}
              className={navBtn(activeSurface === 'CREATE')}
            >
              Organise
            </button>
          )}
          {inEvent && selectedEventId && (
            <>
              <span aria-hidden="true" className="h-4 w-px bg-[#cf9f5d]/30" />
              <button
                type="button"
                onClick={() => navigate('EXPERIENCE')}
                className={navBtn(activeSurface === 'EXPERIENCE')}
              >
                Event
              </button>
              <button
                type="button"
                onClick={() => navigate('LIVE')}
                className={navBtn(activeSurface === 'LIVE')}
              >
                Venue
              </button>
              {context?.isOrganiser && (
                <button
                  type="button"
                  data-testid="nav-studio"
                  onClick={() => navigate('ORGANISE')}
                  className={navBtn(activeSurface === 'ORGANISE')}
                >
                  Studio
                </button>
              )}
            </>
          )}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          {isDemoIdentity && (
            <button
              type="button"
              onClick={exitShowcaseIdentity}
              className="hidden sm:inline-flex px-3 py-2 text-[10px] font-mono tracking-widest border border-[#cf9f5d]/40 text-[#cf9f5d] hover:bg-[#1a0206] cursor-pointer whitespace-nowrap"
              title="You are using a showcase identity. Exit to return to your own account."
            >
              SHOWCASE IDENTITY · EXIT
            </button>
          )}
          {inEvent && context && (
            <button
              type="button"
              onClick={() => handleOpenAskAuvresence()}
              aria-label="Ask Auvresence"
              className="px-2 sm:px-4 min-h-11 py-2 text-xs font-medium bg-[#1a0206] border border-[#cf9f5d]/40 text-[#edd2ab] hover:bg-[#24040a] hover:border-[#cf9f5d] transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-[#cf9f5d]" />
              <span className="hidden sm:inline">Ask Auvresence</span><span className="sm:hidden">Ask</span>
            </button>
          )}
          {user ? (
            <ProfileMenu
              user={user}
              photoURL={photoURL}
              onGoHome={goHome}
              onSignOut={handleSignOut}
            />
          ) : (
            <button
              type="button"
              data-testid="sign-in"
              onClick={() => void handleSignIn()}
              disabled={signingIn}
              className="text-xs tracking-[0.28em] uppercase text-[#edd2ab] border-b border-[#cf9f5d]/60 pb-1 hover:text-[#faf6f0] disabled:opacity-50 cursor-pointer"
            >
              {signingIn ? 'Signing in…' : 'Sign in'}
            </button>
          )}
        </div>
      </header>

      <JudgeModeBar
        isOpen={judgeModeOpen}
        onClose={() => setJudgeModeOpen(false)}
        health={health}
        activeStep={activeDemoStep}
        onSelectStep={handleSelectDemoStep}
        onNextStep={handleNextDemoStep}
        onStartTwoMinDemo={handleStartTwoMinDemo}
        onResetGoldenPath={() => handleResetGoldenPath('ACCEPTED_READY')}
        activeRole={user?.activeRole}
        onSwitchAccount={(acc) => activateShowcaseAccount(acc)}
        onNavigateSurface={(surf) => navigate(surf as NavSurface)}
        hasLastTrace={Boolean(lastTrace)}
        onOpenLastXRay={() => setXRayOpen(true)}
      />

      <main className="flex-1">
        {activeSurface === 'EXPLORE' && (
          <ExploreView
            events={publicEvents}
            loading={eventsLoading}
            error={eventsError}
            onRetry={fetchPublicEvents}
            onBack={goHome}
            onOpenEvent={(id) => openEventSpace(id, 'DISCOVERY')}
          />
        )}

        {activeSurface === 'CREATE' &&
          (user ? (
            <CreateEventView
              getToken={getToken}
              initialDescription={createPrefill}
              onCancel={goHome}
              onCreated={async (ev) => {
                // Open Studio for THIS event under THIS signed-in identity.
                setContext(null);
                setContextError(null);
                setSelectedEventId(ev.id);
                setOrganiserSubTab('OVERVIEW');
                navigate('ORGANISE', { eventId: ev.id });
                await Promise.all([
                  fetchEventContext(ev.id),
                  fetchJourneys(),
                  fetchPublicEvents(),
                ]);
              }}
            />
          ) : (
            <div className="max-w-xl mx-auto px-6 py-32 text-center space-y-6">
              <p className="font-display text-4xl">Sign in to organise an event.</p>
              <button
                type="button"
                onClick={() => void handleSignIn('ORGANISE')}
                className="bg-[#cf9f5d] px-8 py-4 text-xs font-semibold tracking-[0.22em] uppercase text-[#0d0608] hover:bg-[#edd2ab] cursor-pointer"
              >
                Sign in
              </button>
            </div>
          ))}

        {activeSurface === 'EXPERIENCE' &&
          eventGate(
            <ParticipantView
              user={user}
              authToken={authToken}
              authMode={authMode ?? undefined}
              events={publicEvents}
              selectedEventId={selectedEventId ?? 0}
              onSelectEvent={(id) => openEventSpace(id, participantSubTab)}
              context={context}
              onRefreshContext={() => fetchEventContext()}
              onOpenAskAuvresence={handleOpenAskAuvresence}
              onOpenVenueMap={() => navigate('LIVE')}
              onOpenVerificationPreview={handleOpenVerificationPreview}
              onSignInAsParticipant={requestSignIn}
              onSwitchToOrganiser={async () => {
                if (selectedEventId && context?.isOrganiser)
                  await openStudio(selectedEventId);
              }}
              onResetGoldenPath={handleResetGoldenPath}
              externalSubTab={participantSubTab}
              onSubTabChange={(t) => setParticipantSubTab(t)}
              onRecordActionTrace={handleRecordActionTrace}
              onOpenLastXRay={() => setXRayOpen(true)}
              ttsConfigured={health?.ttsConfigured}
            />
          )}

        {activeSurface === 'ORGANISE' &&
          eventGate(
            <OrganiserView
              user={user}
              authToken={authToken}
              authMode={authMode ?? undefined}
              context={context}
              onRefreshContext={() => fetchEventContext()}
              onSwitchToParticipantAccount={goHome}
              onOpenVerificationPreview={handleOpenVerificationPreview}
              onOpenAskAuvresence={handleOpenAskAuvresence}
              externalActiveTab={organiserSubTab}
              onTabChange={(t) => setOrganiserSubTab(t)}
              onRecordActionTrace={handleRecordActionTrace}
              onOpenLastXRay={() => setXRayOpen(true)}
            />
          )}

        {activeSurface === 'LIVE' &&
          eventGate(
            <LiveVenueView
              user={user}
              authToken={authToken}
              context={context}
              onRefreshContext={() => fetchEventContext()}
              onOpenAskAuvresence={handleOpenAskAuvresence}
              onSignInAsParticipant={requestSignIn}
              onRecordActionTrace={handleRecordActionTrace}
              onBackToCompanion={() => navigate('EXPERIENCE')}
              onOpenVenueStudio={() => { setOrganiserSubTab('VENUES'); navigate('ORGANISE'); }}
            />
          )}

        {activeSurface === 'SECURITY' && health?.debugToolsEnabled === true && (
          <SecurityInspectorView
            onRestoreUserSession={async () => {
              if (authMode === 'ORGANISER_B') await activateShowcaseAccount('ORGANISER_B');
              else if (authMode === 'PARTICIPANT_A') await activateShowcaseAccount('PARTICIPANT_A');
            }}
          />
        )}

        {activeSurface === 'ARCHITECTURE' && health?.debugToolsEnabled === true && (
          <ArchitectureView
            onNavigateTab={(tab) => navigate(tab as NavSurface)}
            onOpenAskAuvresence={handleOpenAskAuvresence}
          />
        )}
      </main>

      {/* Mobile event navigation — only inside an event */}
      {inEvent && (
        <nav
          aria-label="Mobile Navigation"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-[#0d0608]/95 backdrop-blur-xs border-t border-[#cf9f5d]/20 px-4 flex items-center justify-between text-[11px] font-mono tracking-wider"
        >
          <button type="button" onClick={goHome} className="min-h-11 py-2 text-[#faf6f0]/65 cursor-pointer">
            HOME
          </button>
          <button
            type="button"
            onClick={() => navigate('EXPERIENCE')}
            className={`min-h-11 py-2 cursor-pointer ${activeSurface === 'EXPERIENCE' ? 'text-[#cf9f5d] font-semibold' : 'text-[#faf6f0]/65'}`}
          >
            EVENT
          </button>
          {user && (
            <button
              type="button"
              onClick={() => handleOpenAskAuvresence()}
              aria-label="Open Auvresence"
              className="w-11 h-11 flex items-center justify-center bg-[#cf9f5d] text-[#0d0608] font-semibold cursor-pointer"
            >
              ✦
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('LIVE')}
            className={`min-h-11 py-2 cursor-pointer ${activeSurface === 'LIVE' ? 'text-[#cf9f5d] font-semibold' : 'text-[#faf6f0]/65'}`}
          >
            VENUE
          </button>
          {context?.isOrganiser && (
            <button
              type="button"
              onClick={() => navigate('ORGANISE')}
              className={`min-h-11 py-2 cursor-pointer ${activeSurface === 'ORGANISE' ? 'text-[#cf9f5d] font-semibold' : 'text-[#faf6f0]/65'}`}
            >
              STUDIO
            </button>
          )}
        </nav>
      )}

      {/* Ask Auvresence assists from INSIDE the product — never the entrance */}
      {inEvent && context && (
        <AskAuvresenceDrawer
          isOpen={askDrawerOpen}
          initialQuestion={askInitialQuestion}
          onClose={() => setAskDrawerOpen(false)}
          user={user}
          authToken={authToken}
          context={context}
          isOrganiserContext={activeSurface === 'ORGANISE'}
          voiceConfigured={health?.voiceConfigured}
          visionConfigured={health?.visionConfigured}
          onSignInAsParticipant={requestSignIn}
          onSwitchToOrganiserAccount={getToken}
          onRefreshContext={() => fetchEventContext()}
          onNavigateVenue={() => navigate('LIVE')}
          onNavigateSchedule={() => {
            setParticipantSubTab('SCHEDULE');
            navigate('EXPERIENCE');
          }}
          onNavigateOrganiserApplications={() => {
            setOrganiserSubTab('APPLICATIONS');
            navigate('ORGANISE');
          }}
          onRecordActionTrace={handleRecordActionTrace}
        />
      )}

      <ActionXRayModal
        trace={xRayOpen ? lastTrace : null}
        onClose={() => setXRayOpen(false)}
      />

      <footer className="border-t border-[#cf9f5d]/15 bg-[#0d0608] px-6 py-8 pb-20 md:pb-8">
        <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#faf6f0]/50">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display text-[#edd2ab]/80 tracking-widest">
              AUVRESENCE
            </span>
            {user && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-[11px] text-[#faf6f0]/60">
                  {user.displayName}
                </span>
              </>
            )}
          </div>

          {health?.debugToolsEnabled === true && (
            <button
              type="button"
              onClick={() => setJudgeModeOpen((prev) => !prev)}
              className="font-mono text-[11px] tracking-widest text-[#cf9f5d]/75 hover:text-[#cf9f5d] transition-colors cursor-pointer whitespace-nowrap"
            >
              {judgeModeOpen ? 'CLOSE TECHNOVATE' : 'TECHNOVATE'}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
