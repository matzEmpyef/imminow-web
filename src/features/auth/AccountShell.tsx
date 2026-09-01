import type { ReactNode } from 'react'
import { Bell, UserRound } from 'lucide-react'
import { SidebarShell, type SidebarSection } from '@/components/SidebarShell'

// N2 (second-pass review, 1 Sep 2026): students CAN authenticate on this origin (one identity
// system) and land on /account (see lib/roleHome.ts's student branch). They used to get the full
// consultancy AppShell around it — Lead Pool, Clients, Administration in the nav — every click of
// which just bounced off ConsultancyRoute back to /account. Safe, but another role's IA. This is
// the honest chrome for what a student can actually do on the console: manage the account, read
// notifications. Everything else in their world lives in the Sentpo app. Same SidebarShell
// primitive as the other three shells (platform-wide consistency rule), just the two-entry nav.
const SECTIONS: SidebarSection[] = [
  {
    key: 'account',
    label: 'My Account',
    path: '/account',
    icon: UserRound,
    matches: (p) => p.startsWith('/account'),
  },
  {
    key: 'notifications',
    label: 'Notifications',
    path: '/notifications',
    icon: Bell,
    matches: (p) => p.startsWith('/notifications'),
  },
]

export function AccountShell({ children }: { children: ReactNode }) {
  return (
    <SidebarShell sections={SECTIONS} roleBadge="Student">
      {children}
    </SidebarShell>
  )
}
