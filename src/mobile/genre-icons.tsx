import {
  Axe, Boxes, BookOpen, Building2, Car, ClipboardList, Coffee, Cog, Compass, Crosshair, Dices, DoorOpen, EyeOff, Flame, Focus, Footprints, Ghost, Globe, Hammer, Heart, Hourglass, Joystick, Map, MessageSquareText,
  PartyPopper, Puzzle, Route, Scroll, Shield, Skull, Sprout, Sword, Swords, Tag, Target, Tent, Timer, Users, Wheat,
  type LucideIcon,
} from 'lucide-react'

/** A small mark for each genre kryo.to's catalog carries. */
const BY_GENRE: Record<string, LucideIcon> = {
  Indie: Sprout,
  Adventure: Compass,
  Action: Swords,
  Simulation: Cog,
  Casual: Coffee,
  RPG: Scroll,
  Strategy: Map,
  Sandbox: Boxes,
  Horror: Skull,
  Survival: Tent,
  'Visual Novel': BookOpen,
  Puzzle: Puzzle,
  'Open World': Globe,
  'First-Person Shooter': Crosshair,
  'Action RPG': Sword,
  Shooter: Target,
  Roguelike: Dices,
  Crafting: Hammer,
  Platformer: Footprints,
  'Survival Horror': Ghost,
  Idle: Hourglass,
  'Dungeon Crawler': DoorOpen,
  Soulslike: Flame,
  Fighting: Shield,
  'Interactive Fiction': MessageSquareText,
  'City Builder': Building2,
  Arcade: Joystick,
  'Life Sim': Heart,
  Racing: Car,
  MMO: Users,
  Party: PartyPopper,
  'Third-Person Shooter': Focus,
  Tactical: Route,
  'Real-Time Strategy': Timer,
  Management: ClipboardList,
  'Farming Sim': Wheat,
  Stealth: EyeOff,
  'Hack and Slash': Axe,
}

export const GENRE_ICONS: ReadonlyMap<string, LucideIcon> = new globalThis.Map(Object.entries(BY_GENRE).map(([k, v]) => [k.toLowerCase(), v]))

/** The genre's icon, case-insensitive; a plain tag for one we have no mark for. */
export function genreIcon(name: string): LucideIcon {
  return GENRE_ICONS.get(name.trim().toLowerCase()) ?? Tag
}

/** The icon drawn in front of a genre's name. */
export function GenreIcon({ genre, className = 'size-3 shrink-0' }: { genre: string; className?: string }) {
  const Icon = genreIcon(genre)
  return <Icon className={className} aria-hidden />
}
