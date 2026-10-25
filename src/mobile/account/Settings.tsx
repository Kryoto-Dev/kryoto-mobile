import { useState } from 'react'
import { Bell, Heart, Palette, Shield, User } from 'lucide-react'
import { useApp, type SettingsTab } from '@/mobile/context'
import { Chip, Notice, PageHeader, Strip } from '@/mobile/parts'
import { AccountTab } from '@/mobile/account/settings/Account'
import { AppearanceTab } from '@/mobile/account/settings/Appearance'
import { NotificationsTab } from '@/mobile/account/settings/Notifications'
import { SecurityTab } from '@/mobile/account/settings/Security'
import { SupportTab } from '@/mobile/account/settings/Support'

/** The same five categories as kryo.to's Settings (SETTINGS_CATEGORIES). */
const TABS = [
  { id: 'account', label: 'Account', icon: User, panel: AccountTab },
  { id: 'appearance', label: 'Appearance', icon: Palette, panel: AppearanceTab },
  { id: 'notifications', label: 'Notifications', icon: Bell, panel: NotificationsTab },
  { id: 'security', label: 'Security', icon: Shield, panel: SecurityTab },
  { id: 'support', label: 'Support', icon: Heart, panel: SupportTab },
] as const

export function Settings({ tab }: { tab?: SettingsTab }) {
  const { token, back } = useApp()
  const [current, setCurrent] = useState<SettingsTab>(tab ?? 'account')
  // A panel mounts the first time its tab is opened and stays mounted, so an
  // unsaved edit survives a look at another tab and no tab loads before it is wanted.
  const [opened, setOpened] = useState<ReadonlySet<SettingsTab>>(() => new Set([tab ?? 'account']))

  if (!token) {
    return (
      <>
        <PageHeader title="Settings" onBack={back} />
        <Notice title="Sign in first" body="Settings belong to your kryo.to account. Sign in from the Profile tab." />
      </>
    )
  }

  const choose = (id: SettingsTab) => {
    setCurrent(id)
    setOpened((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
  }

  return (
    <>
      <PageHeader title="Settings" onBack={back} />
      <div className="grid gap-4 px-4 pb-8 pt-4">
        <Strip>
          {TABS.map(({ id, label, icon: Icon }) => (
            <Chip key={id} active={current === id} onClick={() => choose(id)} icon={<Icon className="size-3 shrink-0" aria-hidden />}>
              {label}
            </Chip>
          ))}
        </Strip>
        {TABS.map(({ id, panel: Panel }) =>
          opened.has(id) ? (
            <div key={id} hidden={current !== id} className="grid gap-4">
              <Panel />
            </div>
          ) : null,
        )}
      </div>
    </>
  )
}
