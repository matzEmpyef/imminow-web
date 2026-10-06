import type { ComponentType, ReactNode } from 'react'
import { AccountShell } from './AccountShell'
import { AdminShell } from './AdminShell'
import { AppShell } from './AppShell'
import { FreelancerShell } from './FreelancerShell'
import type { MeScope } from '@/queries/me'

/**
 * The chrome each part of the product uses, from `GET /me`'s `scope`. The two pages every account
 * owns (My Account, Notifications) and the page-crash screen all pick their shell here, so a
 * platform or freelancer account is never drawn inside the consultancy menu (M12, 1 Sep 2026) and
 * a student gets the slim two-entry one (N2).
 */
export function shellForScope(scope: MeScope | undefined): ComponentType<{ children: ReactNode }> {
  if (scope === 'platform') return AdminShell
  if (scope === 'freelancer') return FreelancerShell
  if (scope === 'student') return AccountShell
  return AppShell
}
