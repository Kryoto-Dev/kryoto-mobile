import type { SVGProps } from 'react'

/**
 * The Library's two tab icons, drawn as outlines that trace themselves when
 * their tab is chosen (motion.css, `.m-draw` / `data-draw`). They use
 * currentColor, so they follow the tab's text colour.
 */
function Frame(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
      className={`m-draw ${props.className ?? ''}`}
    />
  )
}

/** A game pad: body, d-pad and two buttons. */
export function GamesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Frame {...props}>
      <path data-draw pathLength={1} d="M6.5 7.5h11a4.5 4.5 0 0 1 4.4 3.6l.9 4.4a2.6 2.6 0 0 1-4.4 2.3L16 15.5H8l-2.4 2.3a2.6 2.6 0 0 1-4.4-2.3l.9-4.4a4.5 4.5 0 0 1 4.4-3.6Z" />
      <path data-draw pathLength={1} d="M7.5 10.5v3M6 12h3" />
      <path data-draw pathLength={1} d="M15.5 11.2h.01M18 12.8h.01" strokeWidth={2.6} />
    </Frame>
  )
}

/** An arrow dropping into a tray. */
export function DownloadsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Frame {...props}>
      <path data-draw pathLength={1} d="M12 3v11.5" />
      <path data-draw pathLength={1} d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path data-draw pathLength={1} d="M4 15.5V18a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 20 18v-2.5" />
    </Frame>
  )
}
