import React, { useEffect, useState } from 'react';
import { Check, XCircle, ArrowLeft, MapPin, RefreshCw } from 'lucide-react';

interface VerificationPayload {
  valid: boolean;
  status: string;
  participantName?: string;
  participantCode?: string;
  roleCategory?: string;
  eventTitle?: string;
  verificationBasis?: string;
  verifiedAt?: string;
  error?: string;
}

interface VerificationViewProps {
  token: string;
  onBackToApp?: () => void;
}

export const VerificationView: React.FC<VerificationViewProps> = ({
  token,
  onBackToApp,
}) => {
  const [data, setData] = useState<VerificationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVerification = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/verify/${encodeURIComponent(token)}`);
      const json = await res.json();
      setData(json);
    } catch {
      setError('Unable to verify credential right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVerification();
  }, [token]);

  return (
    <div className="min-h-screen bg-[#080203] text-[#FCFAF7] flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-6">
        {onBackToApp && (
          <button
            type="button"
            onClick={onBackToApp}
            className="inline-flex items-center gap-2 text-xs font-mono text-[#E6C887]/80 hover:text-[#FCFAF7] transition-colors cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            RETURN TO AUVRESENCE
          </button>
        )}

        <div className="border border-[#E6C887]/45 bg-gradient-to-b from-[#120608] to-[#080203] p-8 sm:p-10 space-y-8 shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#E6C887]/20 pb-5">
            <span className="text-xs font-mono tracking-[0.28em] text-[#E6C887]">
              AUVRESENCE
            </span>
            <span className="text-xs font-mono text-[#E6C887]/75">
              CREDENTIAL VERIFICATION
            </span>
          </div>

          {loading ? (
            <div className="py-12 space-y-4">
              <div className="h-4 w-32 bg-[#17090C] animate-pulse" />
              <div className="h-10 w-64 bg-[#17090C] animate-pulse" />
              <div className="h-20 bg-[#17090C] animate-pulse" />
            </div>
          ) : error ? (
            <div className="py-8 text-center space-y-4">
              <XCircle className="w-8 h-8 text-red-400 mx-auto" />
              <p className="text-base font-display text-[#FCFAF7]">{error}</p>
              <button
                type="button"
                onClick={fetchVerification}
                className="px-5 py-2.5 text-xs font-semibold bg-[#E51E2B] text-[#FCFAF7] hover:bg-[#C41224] transition-colors cursor-pointer"
              >
                TRY AGAIN
              </button>
            </div>
          ) : data && data.valid ? (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono tracking-widest text-emerald-300 inline-flex items-center gap-2 font-semibold">
                  <Check className="w-4 h-4" />
                  ACTIVE CREDENTIAL
                </span>
                {data.verifiedAt && (
                  <span className="text-[11px] font-mono text-[#FCFAF7]/50 tabular-nums">
                    {new Date(data.verifiedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <h1 className="text-3xl sm:text-4xl font-display font-normal text-[#FCFAF7] uppercase tracking-wide">
                  {data.participantName}
                </h1>
                <p className="text-xs font-mono tracking-widest text-[#E6C887] uppercase">
                  {data.roleCategory}
                </p>
              </div>

              <div className="pt-4 border-t border-[#E6C887]/20 space-y-1.5">
                <p className="text-xs font-mono text-[#FCFAF7]/50">EVENT</p>
                <p className="text-lg font-display text-[#FCFAF7]">
                  {data.eventTitle}
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-6 pt-4 border-t border-[#E6C887]/20 text-xs">
                <div>
                  <dt className="font-mono text-[#FCFAF7]/50">IDENTIFIER</dt>
                  <dd className="font-mono text-sm text-[#E6C887] mt-1 tabular-nums">
                    {data.participantCode}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[#FCFAF7]/50">STATUS</dt>
                  <dd className="font-mono text-sm text-emerald-300 mt-1">
                    {data.status}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="space-y-6 py-4">
              <div className="flex items-center gap-3 text-red-300">
                <XCircle className="w-5 h-5 shrink-0" />
                <span className="text-xs font-mono tracking-widest uppercase">
                  CREDENTIAL NOT ACTIVE
                </span>
              </div>

              <p className="text-sm text-[#FCFAF7]/75 leading-relaxed">
                {data?.error ||
                  'This credential is not active or could not be verified.'}
              </p>

              {data?.participantName && (
                <div className="pt-4 border-t border-[#E6C887]/20 space-y-1 text-xs font-mono">
                  <p className="text-[#FCFAF7]">{data.participantName}</p>
                  <p className="text-red-300">{data.status}</p>
                </div>
              )}
            </div>
          )}

          <div className="pt-4 border-t border-[#E6C887]/20 flex items-center justify-between text-xs">
            <span className="font-mono text-[#FCFAF7]/45">
              {data?.verificationBasis || 'Verified against registration state'}
            </span>
            <button
              type="button"
              onClick={fetchVerification}
              className="text-[#E6C887] hover:text-[#E6C887] transition-colors cursor-pointer"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface WaypointRouteViewProps {
  waypointToken: string;
  authToken: string | null;
  onSignInAsParticipant: () => Promise<string | null>;
  onReturnToLive: () => void;
}

export const WaypointRouteView: React.FC<WaypointRouteViewProps> = ({
  waypointToken,
  authToken,
  onSignInAsParticipant,
  onReturnToLive,
}) => {
  const [status, setStatus] = useState<
    'IDLE' | 'SCANNING' | 'SUCCESS' | 'ERROR'
  >('IDLE');
  const [venueName, setVenueName] = useState<string>('');
  const [venueMeta, setVenueMeta] = useState<string>('');
  const [scannedAt, setScannedAt] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const performScan = async (tokenToUse: string) => {
    setStatus('SCANNING');
    setErrorMessage('');
    try {
      const res = await fetch('/api/waypoints/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenToUse}`,
        },
        body: JSON.stringify({ waypointToken }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Check-in rejected.');
      }
      setVenueName(json.venue.name);
      setVenueMeta(`${json.venue.floor} · ${json.venue.zone}`);
      setScannedAt(
        new Date(json.scan.scannedAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
      setStatus('SUCCESS');
    } catch (err: any) {
      setErrorMessage(err.message || 'Check-in failed.');
      setStatus('ERROR');
    }
  };

  useEffect(() => {
    if (authToken) {
      performScan(authToken);
    }
  }, [waypointToken, authToken]);

  const handleQuickParticipantAuthAndScan = async () => {
    const newToken = await onSignInAsParticipant();
    if (newToken) {
      await performScan(newToken);
    }
  };

  return (
    <div className="min-h-screen bg-[#080203] text-[#FCFAF7] flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md border border-[#E6C887]/40 bg-[#120608] p-8 space-y-6">
        <div className="space-y-1">
          <p className="text-xs font-mono tracking-widest text-[#E6C887]">
            AUVRESENCE VENUE
          </p>
          <h1 className="text-2xl font-display text-[#FCFAF7]">
            Location Check-In
          </h1>
        </div>

        {!authToken && status === 'IDLE' ? (
          <div className="space-y-4">
            <p className="text-sm text-[#FCFAF7]/75 leading-relaxed">
              Continue with your Auvresence identity to check in at this
              location.
            </p>
            <button
              type="button"
              onClick={handleQuickParticipantAuthAndScan}
              className="w-full py-3 px-5 text-xs font-semibold bg-[#E51E2B] text-[#FCFAF7] hover:bg-[#C41224] transition-colors cursor-pointer"
            >
              Continue & Check In
            </button>
          </div>
        ) : status === 'SCANNING' ? (
          <div className="py-8 text-center space-y-3">
            <RefreshCw className="w-5 h-5 text-[#E6C887] animate-spin mx-auto" />
            <p className="text-xs font-mono text-[#E6C887]">CHECKING IN...</p>
          </div>
        ) : status === 'SUCCESS' ? (
          <div className="space-y-6">
            <div className="space-y-2 border-t border-[#E6C887]/20 pt-4">
              <div className="flex items-center gap-2 text-xs font-mono text-emerald-300">
                <MapPin className="w-4 h-4" />
                <span>CHECKED IN · {scannedAt}</span>
              </div>
              <h2 className="text-3xl font-display text-[#FCFAF7] uppercase">
                {venueName}
              </h2>
              <p className="text-xs font-mono text-[#E6C887]/80">{venueMeta}</p>
            </div>
            <button
              type="button"
              onClick={onReturnToLive}
              className="w-full py-3 px-5 text-xs font-semibold bg-[#E51E2B] text-[#FCFAF7] hover:bg-[#C41224] transition-colors cursor-pointer"
            >
              Open Venue
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-red-200">{errorMessage}</p>
            <button
              type="button"
              onClick={onReturnToLive}
              className="w-full py-3 px-5 text-xs border border-[#E6C887]/40 text-[#E6C887] hover:bg-[#17090C] transition-colors cursor-pointer"
            >
              Return to Venue
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
