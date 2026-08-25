import type { ReactNode } from 'react'
import { LayoutDashboard } from 'lucide-react'
import { SidebarShell, type SidebarSection } from '@/components/SidebarShell'

// The Freelancer role's own scoped view inside immiNow (build reference 1.19) — "same app, same
// backend, its own scoped view — not a separate frontend to build or deploy." A single page
// (Freelancer Dashboard), so the sidebar has exactly one section and no sub-links — tracking
// only, no chat, no case management — but still shares SidebarShell's chrome for visual
// consistency with the other two roles rather than a bespoke header.
const SECTIONS: SidebarSection[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    path: '/freelancer/dashboard',
    icon: LayoutDashboard,
    matches: (p) => p.startsWith('/freelancer/dashboard'),
  },
]

export function FreelancerShell({ children }: { children: ReactNode }) {
  return (
    <SidebarShell sections={SECTIONS} roleBadge="Freelancer">
      {children}
    </SidebarShell>
  )
}
