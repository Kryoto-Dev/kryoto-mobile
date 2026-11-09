import { useState } from 'react'
import { Info } from '@/ui/pixel-icons'

/**
 * What a community update is, under its release in Release info. The words
 * are a copy of kryo.to's lib/community-update-rules.ts (COMMUNITY_BUILD_EXPLAINER);
 * change both together. A tap opens them in place: no sheet over the sheet.
 */

const LABEL = 'community update'

export function isCommunityRelease(release: { label?: string | null }): boolean {
  return (release.label ?? '').trim().toLowerCase() === LABEL
}

const SHORT = 'Community update: Kryoto Desktop updated these files automatically on a community member’s PC, and they uploaded them.'
const POINTS = [
  'Opt-in. Only players who turn it on share an update, and only after playing the newer build and taking a screenshot of it running.',
  'Checked, not hand-made. Kryoto Desktop records the fingerprint of every file its updater writes, and Kryoto turns away any upload holding a file it did not write. The emulator files have to match Kryoto’s own.',
  'Staff look at every offer before it is published, and testers run it like any other release.',
]
const VERIFIED = 'Verified contributor: staff vouch for this person.'
const UNVERIFIED =
  'Unverified contributor: nobody on the team has vouched for this person yet. An unverified build could in theory contain something extra; the checks try hard to stop that.'

export function CommunityBuildNote() {
  const [open, setOpen] = useState(false)
  return (
    <div className="grid gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 justify-self-start text-[11px] text-muted-foreground outline-none active:opacity-80 focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Info className="size-3.5 shrink-0" aria-hidden />
        What is a community update?
      </button>
      {open ? (
        <div className="grid gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <p className="text-foreground">{SHORT}</p>
          <ul className="grid list-disc gap-1 pl-4">
            {POINTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p>
            {VERIFIED} {UNVERIFIED}
          </p>
        </div>
      ) : null}
    </div>
  )
}
