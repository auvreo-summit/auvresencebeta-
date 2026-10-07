import React from 'react';
import { DoorOpen, Building2, Mic, CircleHelp, Utensils, Coffee, Droplets, Armchair, Bath, HeartPulse, ArrowUpDown, MoveUpRight, Accessibility, LogOut, Flag, MapPin, ClipboardCheck } from 'lucide-react';
import type { PoiType } from '../types.ts';
const icons = { ENTRANCE: DoorOpen, REGISTRATION: ClipboardCheck, HALL: Building2, ROOM: DoorOpen, STAGE: Mic, HELP_DESK: CircleHelp, FOOD: Utensils, CAFE: Coffee, WATER: Droplets, REST_AREA: Armchair, WASHROOM: Bath, MEDICAL: HeartPulse, STAIRS: MoveUpRight, LIFT: ArrowUpDown, ESCALATOR: MoveUpRight, RAMP: Accessibility, EMERGENCY_EXIT: LogOut, ASSEMBLY_POINT: Flag, CUSTOM: MapPin };
export function PoiIcon({ type, className = 'h-3.5 w-3.5' }: { type: PoiType; className?: string }) {
  const Icon = icons[type] || MapPin;
  return <Icon aria-hidden="true" className={className} strokeWidth={1.8} />;
}
