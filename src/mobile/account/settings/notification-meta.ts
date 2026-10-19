// Copied from kryo.to lib/notifications.ts (channels, types, NOTIFICATION_META, groups, isChannelAllowed, isForced).
// Keep in step with the server: it re-applies these rules on every save, so a drifted copy only mis-draws the grid.

/**
 * Notification types, channels and defaults. Shared by the server and the
 * browser, so it carries no server imports.
 *
 * The shape of the system: a notification has a TYPE (what happened) and is
 * delivered over one or more CHANNELS (how you hear about it). Every
 * type/channel pair is a switch the account owner controls, except the handful
 * marked `forced`, which exist so nobody can accidentally turn off the mail
 * telling them their password was changed.
 */

export const NOTIFICATION_CHANNELS = ['inapp', 'email', 'push', 'discord'] as const
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]

export const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  inapp: 'On site',
  email: 'Email',
  push: 'Browser',
  discord: 'Discord',
}

export const CHANNEL_HINT: Record<NotificationChannel, string> = {
  inapp: 'The bell in the header and your notifications page.',
  email: 'Security alerts only. Everything else goes to the other channels.',
  push: 'A desktop or phone notification, even with the tab closed.',
  discord: 'A direct message from the Kryo.to bot.',
}

/**
 * The types email is allowed to carry.
 *
 * Email is deliberately not a general notification channel. The mailbox behind
 * it is an ordinary Proton account, not a bulk sender, so its budget is spent
 * on the mail that has to arrive: address verification, password resets, and
 * the security alerts below. A request going cold is worth a bell, a push and a
 * Discord DM; it is not worth a slice of the sending limit that a locked-out
 * person's password reset depends on.
 *
 * Enforced on read and write in `normalizeChannels`, so a preference row stored
 * back when email was general cannot resurrect it.
 */
export const EMAIL_TYPES = ['account.security'] as const

export function isChannelAllowed(
  type: NotificationType,
  channel: NotificationChannel,
): boolean {
  if (channel !== 'email') return true
  return (EMAIL_TYPES as readonly string[]).includes(type)
}

export const NOTIFICATION_TYPES = [
  'request.queued',
  'request.claimed',
  'request.in_review',
  'request.fulfilled',
  'request.declined',
  'request.cold',
  'request.on_hold',
  'request.backed',
  'request.boost',
  'comment.reply',
  'collection.invite',
  'friend.request',
  'friend.accepted',
  'collection.updated',
  'support.replied',
  'blog.published',
  'changelog.released',
  'site.announcement',
  'signal.refilled',
  'tester.application',
  'tester.verdict',
  'tester.retest',
  'tester.points',
  'tester.perk_expiring',
  'badge.review',
  'upload.takeover',
  'upload.broken',
  'upload.tested',
  'supporter.expiring',
  'account.security',
  'staff.support.opened',
  'staff.support.replied',
  'staff.support.assigned',
  'staff.game.review',
  'staff.test.verdict',
  'staff.tester.application',
  'staff.team.application',
  'team.application',
  'staff.request.priority',
  'staff.game.broken',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export function isNotificationType(value: unknown): value is NotificationType {
  return (
    typeof value === 'string' &&
    (NOTIFICATION_TYPES as readonly string[]).includes(value)
  )
}

export function isNotificationChannel(value: unknown): value is NotificationChannel {
  return (
    typeof value === 'string' &&
    (NOTIFICATION_CHANNELS as readonly string[]).includes(value)
  )
}

export type NotificationTypeMeta = {
  label: string
  description: string
  /** Grouping in the settings grid. */
  group: 'Your requests' | 'The board' | 'Community' | 'Testing' | 'Account' | 'Staff'
  /** Channels switched on for a new account. */
  defaults: NotificationChannel[]
  /**
   * Channels that cannot be switched off. Only used where silence would be
   * actively harmful - an account takeover you never hear about.
   */
  forced?: NotificationChannel[]
}

export const NOTIFICATION_META: Record<NotificationType, NotificationTypeMeta> = {
  'staff.support.opened': { label: 'New support tickets', description: 'A member opens a ticket.', group: 'Staff', defaults: ['inapp', 'push'] },
  'staff.support.replied': { label: 'Support needs a reply', description: 'A member replies or reopens a ticket.', group: 'Staff', defaults: ['inapp', 'push'] },
  'staff.support.assigned': { label: 'Assigned tickets', description: 'A ticket is assigned to you.', group: 'Staff', defaults: ['inapp', 'push'] },
  'staff.game.review': { label: 'Games awaiting review', description: 'A game or proposed update needs a decision.', group: 'Staff', defaults: ['inapp', 'push'] },
  'staff.test.verdict': { label: 'Tester verdicts', description: 'A tester submits a result for confirmation.', group: 'Staff', defaults: ['inapp', 'push'] },
  'staff.tester.application': { label: 'Tester applications', description: 'A new application needs a decision.', group: 'Staff', defaults: ['inapp', 'push'] },
  'staff.team.application': { label: 'Team applications', description: 'Somebody asks to join the team from Discord.', group: 'Staff', defaults: ['inapp', 'push'] },
  'staff.request.priority': { label: 'Priority requests', description: 'A supporter starts a priority or one-day delivery request.', group: 'Staff', defaults: ['inapp', 'push'] },
  'staff.game.broken': { label: 'Confirmed broken games', description: 'A confirmed report needs a working build.', group: 'Staff', defaults: ['inapp', 'push'] },
  'request.queued': {
    label: 'Your request hits its threshold',
    description: 'Enough people backed it that it entered the queue.',
    group: 'Your requests',
    defaults: ['inapp', 'push', 'discord'],
  },
  'friend.request': {
    label: 'Someone sends you a friend request',
    description: 'Accept or decline it on your friends page or in Kryoto Desktop.',
    group: 'Community',
    defaults: ['inapp', 'push'],
  },
  'friend.accepted': {
    label: 'Someone accepts your friend request',
    description: 'You are friends now.',
    group: 'Community',
    defaults: ['inapp', 'push'],
  },
  'request.claimed': {
    label: 'Somebody claims your request',
    description: 'An uploader picked it up to build. Not built yet.',
    group: 'Your requests',
    defaults: ['inapp', 'push'],
  },
  'request.in_review': {
    label: 'Your request has been built',
    description:
      'Someone finished it and it is with a reviewer or the game testers. Not downloadable yet.',
    group: 'Your requests',
    // On-site only by default. The delivered notification is the one worth
    // interrupting somebody for, and firing a push for each of two steps
    // teaches people to ignore the second one.
    defaults: ['inapp'],
  },
  'request.fulfilled': {
    label: 'Your request is delivered',
    description: 'The game you asked for is on the site.',
    group: 'Your requests',
    defaults: ['inapp', 'push', 'discord'],
  },
  'request.declined': {
    label: 'Your request is declined',
    description: 'Staff closed it, with a reason.',
    group: 'Your requests',
    defaults: ['inapp', 'push', 'discord'],
  },
  'request.cold': {
    label: 'Your request goes cold',
    description: 'Its heat decayed away and it dropped off the live board.',
    group: 'Your requests',
    defaults: ['inapp', 'push', 'discord'],
  },
  'request.on_hold': {
    label: 'Your request goes on hold',
    description: 'Accepted, but too big to build right now. It keeps its heat and frees your slot.',
    group: 'Your requests',
    defaults: ['inapp', 'push'],
  },
  'request.backed': {
    label: 'Someone backs your request',
    description:
      'Each new backer. Chatty on a popular request, so this is on-site only by default.',
    group: 'Your requests',
    defaults: ['inapp'],
  },
  'request.boost': {
    label: 'Requests looking for a boost',
    description: 'A request asks for help when you have at least five signal left. At most once a day.',
    group: 'The board',
    defaults: ['inapp', 'push', 'discord'],
  },
  'comment.reply': {
    label: 'Someone replies to you',
    description: 'A reply to one of your comments.',
    group: 'Community',
    defaults: ['inapp', 'push'],
  },
  'collection.invite': {
    label: 'Someone invites you to a collection',
    description: 'An invitation to add games to a list with them.',
    group: 'Community',
    defaults: ['inapp', 'push'],
  },
  'collection.updated': {
    label: 'A collection you follow gets new games',
    description: 'One at a time: no more until you read it or open the collection, however many games are added.',
    group: 'Community',
    defaults: ['inapp', 'push'],
  },
  'support.replied': {
    label: 'Support replies to your ticket',
    description: 'An answer on a ticket you opened.',
    group: 'Account',
    // On by default across every channel, and this is the one place that is
    // clearly right: you asked us a question. An answer you never see is the
    // same as no answer, and for an account with no email this is the ONLY way
    // a reply can arrive at all.
    defaults: ['inapp', 'push', 'discord'],
  },
  'blog.published': {
    label: 'New blog post',
    description: 'Site news and write-ups as they go live.',
    group: 'The board',
    defaults: ['inapp'],
  },
  'changelog.released': {
    label: 'Site updates',
    description: 'What shipped in each release.',
    group: 'The board',
    defaults: ['inapp'],
  },
  'site.announcement': {
    label: 'Announcements',
    description: 'News from the Kryoto team, like a new donation goal. Rare.',
    group: 'The board',
    defaults: ['inapp', 'push'],
  },
  'signal.refilled': {
    label: 'Your signal refills',
    description: 'The weekly reminder that you have votes to spend again.',
    group: 'The board',
    defaults: [],
  },
  'team.application': {
    label: 'Your team application',
    description: 'An owner approved or turned down your application to join the team.',
    group: 'Account',
    defaults: ['inapp', 'push', 'discord'],
  },
  'tester.application': {
    label: 'Your tester application',
    description: 'Staff approved or turned down your application to the game tester team.',
    group: 'Testing',
    defaults: ['inapp', 'push', 'discord'],
  },
  'tester.verdict': {
    label: 'Your reports were reviewed',
    description: 'A report you sent was accepted, turned down, taken back, or has a question for you; an edit was accepted or not.',
    group: 'Testing',
    defaults: ['inapp', 'push'],
  },
  'tester.retest': {
    label: 'A game you tested has a new build',
    description: 'Your report was on an older build, so it could use a fresh test. Once per game.',
    group: 'Testing',
    defaults: ['inapp'],
  },
  'tester.points': {
    label: 'Your reputation changed',
    description: 'Points added or taken away, with the reason.',
    group: 'Testing',
    defaults: ['inapp'],
  },
  'tester.perk_expiring': {
    label: 'A perk is about to run out',
    description: 'Three days before something you bought with Kryos expires.',
    group: 'Testing',
    defaults: ['inapp'],
  },
  'badge.review': {
    label: 'Your custom badge was reviewed',
    description: 'Staff approved or turned down the badge you asked for.',
    group: 'Testing',
    defaults: ['inapp', 'push'],
  },
  'upload.takeover': {
    label: 'Somebody takes over your upload',
    description: 'Staff published a game you were building, or had submitted, in your place.',
    group: 'The board',
    defaults: ['inapp', 'push', 'discord'],
  },
  'upload.broken': {
    label: 'A game you added is reported broken',
    description: 'A game tester or players found it does not work. Staff also get it on their todo board.',
    group: 'Testing',
    defaults: ['inapp', 'push', 'discord'],
  },
  'upload.tested': {
    label: 'A tester reviews your upload',
    description: 'A tester submits a working or broken verdict. Staff still need to confirm it.',
    group: 'Testing',
    defaults: ['inapp', 'push'],
  },
  'supporter.expiring': {
    label: 'Your supporter perks are running out',
    description: 'A few days before your perks end, with how to keep them.',
    group: 'Account',
    defaults: ['inapp', 'push', 'discord'],
  },
  'account.security': {
    label: 'Security alerts',
    description:
      'Password changes, email changes, and new sign-ins. Email cannot be switched off.',
    group: 'Account',
    defaults: ['inapp', 'email'],
    forced: ['email'],
  },
}

export const NOTIFICATION_GROUPS: NotificationTypeMeta['group'][] = [
  'Your requests',
  'The board',
  'Community',
  'Testing',
  'Account',
  'Staff',
]

export function isForced(
  type: NotificationType,
  channel: NotificationChannel,
): boolean {
  return (NOTIFICATION_META[type].forced ?? []).includes(channel)
}


export type NotificationPrefs = Record<NotificationType, NotificationChannel[]>
