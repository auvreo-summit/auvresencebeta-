import React, { useEffect, useRef, useState } from 'react';
import type { UserProfile } from '../types.ts';

interface ProfileMenuProps {
  user: UserProfile;
  photoURL?: string | null;
  onGoHome: () => void;
  onSignOut: () => void;
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'A';

export const ProfileMenu: React.FC<ProfileMenuProps> = ({
  user,
  photoURL,
  onGoHome,
  onSignOut,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Open profile menu"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="profile-avatar"
        onClick={() => setOpen((v) => !v)}
        className="w-11 h-11 rounded-full overflow-hidden border border-[#E6C887]/50 bg-[#17090C] text-[#E6C887] text-xs font-semibold tracking-wider flex items-center justify-center hover:border-[#E6C887] transition-colors cursor-pointer"
      >
        {photoURL ? (
          <img
            src={photoURL}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        ) : (
          initialsOf(user.displayName)
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-3 w-64 bg-[#120608] border border-[#E6C887]/30 shadow-2xl z-50"
        >
          <div className="px-4 py-4 border-b border-[#E6C887]/15">
            <p className="text-sm text-[#FCFAF7] truncate">{user.displayName}</p>
            <p className="text-xs text-[#FCFAF7]/55 truncate mt-0.5">
              {user.email}
            </p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onGoHome();
            }}
            className="w-full text-left px-4 py-3 text-xs tracking-widest uppercase text-[#E6C887] hover:bg-[#17090C] cursor-pointer"
          >
            Home
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="sign-out"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="w-full text-left px-4 py-3 text-xs tracking-widest uppercase text-[#FCFAF7]/70 hover:bg-[#17090C] border-t border-[#E6C887]/10 cursor-pointer"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
};
