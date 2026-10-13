import { useFeatures } from '@/lib/features'
import { useAvailablePermissions, visiblePermissionGroups, withoutUnusablePermissions } from '@/lib/permissions'

/**
 * The permission checklist for an editor: what the plan makes available (`available_permissions`),
 * less any permission whose feature the plan lacks. Both editors (a designation's baseline and an
 * employee's overrides) call this so they cannot disagree.
 */
export function usePermissionGroups(...keySources: (Record<string, boolean> | undefined | null)[]) {
  const available = useAvailablePermissions()
  const features = useFeatures().data
  return withoutUnusablePermissions(visiblePermissionGroups(available, ...keySources), (key) => features[key] === true)
}
