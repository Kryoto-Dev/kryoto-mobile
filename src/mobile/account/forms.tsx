import type { ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import { Button, Caption, Check, inputCls } from '@/ui'
import { cn } from '@/lib/utils'
import { openExternal } from '@/mobile/auth'

/** A labelled control with an optional hint and a character counter. */
export function FieldRow({ label, hint, counter, children }: { label: string; hint?: ReactNode; counter?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Caption className="font-bold text-foreground/80">{label}</Caption>
        {counter ? <Caption>{counter}</Caption> : null}
      </div>
      {children}
      {hint ? <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function TextField({
  value,
  onChange,
  max,
  placeholder,
  type = 'text',
  autoComplete,
  inputMode,
  disabled,
  label,
}: {
  value: string
  onChange: (v: string) => void
  max?: number
  placeholder?: string
  type?: string
  autoComplete?: string
  inputMode?: 'text' | 'email' | 'url' | 'numeric' | 'search'
  disabled?: boolean
  label?: string
}) {
  return (
    <input
      className={cn(inputCls, disabled && 'opacity-50')}
      type={type}
      value={value}
      maxLength={max}
      placeholder={placeholder}
      autoComplete={autoComplete ?? 'off'}
      inputMode={inputMode}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function TextArea({ value, onChange, max, placeholder, rows = 4, disabled }: { value: string; onChange: (v: string) => void; max?: number; placeholder?: string; rows?: number; disabled?: boolean }) {
  return (
    <textarea
      className={cn('kryo-radius w-full resize-none border border-border bg-background px-4 py-2.5 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground', disabled && 'opacity-50')}
      rows={rows}
      value={value}
      maxLength={max}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function ToggleRow({ label, hint, checked, onChange, disabled }: { label: string; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-1">
      <Check checked={checked} onChange={onChange} label={label} disabled={disabled} />
      {hint ? <p className="pl-[1.625rem] text-[11px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function Status({ msg, ok }: { msg: string | null | undefined; ok?: boolean }) {
  if (!msg) return null
  return (
    <p role="status" className={cn('text-xs leading-relaxed', ok ? 'text-success' : 'text-destructive')}>
      {msg}
    </p>
  )
}

/** Sticks above the tab bar while a form has unsaved changes. */
export function SaveBar({ dirty, busy, onSave, onReset, status }: { dirty: boolean; busy: boolean; onSave: () => void; onReset?: () => void; status?: { msg: string; ok?: boolean } | null }) {
  // Only there while there is something to save or say; pinned above the tab bar, with a spacer so the last field stays reachable.
  if (!dirty && !busy && !status?.msg) return null
  return (
    <>
      <div aria-hidden className="h-24" />
      <div className="kryo-radius fixed inset-x-4 bottom-[calc(var(--sab)+5rem)] z-30 grid gap-2 border border-border bg-card p-3 shadow-2xl shadow-black/60">
        <Status msg={status?.msg} ok={status?.ok} />
        <div className="flex gap-2">
          <Button variant="primary" disabled={!dirty || busy} onClick={onSave}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          {onReset ? (
            <Button variant="ghost" disabled={!dirty || busy} onClick={onReset}>
              Reset
            </Button>
          ) : null}
        </div>
      </div>
    </>
  )
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="m-panel grid gap-2.5">
      <Caption className="font-bold text-foreground/80">{title}</Caption>
      {children}
    </section>
  )
}

/** A row that opens a kryo.to page in the phone's browser. */
export function LinkOut({ label, url }: { label: string; url: string }) {
  return (
    <button type="button" onClick={() => void openExternal(url)} className="kryo-radius flex items-center justify-between border border-border bg-card px-4 py-3 text-left text-xs text-foreground">
      {label}
      <ExternalLink className="size-4 text-muted-foreground" />
    </button>
  )
}
