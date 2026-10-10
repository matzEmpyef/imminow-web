import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { AppShell } from '@/features/auth/AppShell'
import { Badge } from '@/components/Badge'
import { Card } from '@/components/Card'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useFormTemplate } from '@/queries/formTemplates'
import { useAccountWords } from '@/lib/accountWords'
import { FormFieldsPreview } from './FormFieldsPreview'

/**
 * A form as someone WITHOUT `settings.manage_templates` sees it (review 2.64). The server lets
 * every employee of the consultancy read a form (`GET /form-templates/{id}`) and keeps writes to
 * the permission, so the fields and their settings are shown and nothing can be changed or saved.
 */
export function FormReadOnlyView({ id }: { id: string }) {
  const form = useFormTemplate(id)
  const { org } = useAccountWords()

  if (form.isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-64 rounded-lg" />
      </AppShell>
    )
  }
  if (form.isError || !form.data) {
    return (
      <AppShell>
        <ErrorState message="Could not load this form." onRetry={() => form.refetch()} error={form.error} />
      </AppShell>
    )
  }

  const { name, version, is_default, fields } = form.data
  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div className="flex flex-col gap-xs">
          <Link
            to="/administration/forms"
            className="inline-flex items-center gap-xs text-body-sm text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Forms
          </Link>
          <div className="flex items-center gap-sm">
            <h1 className="text-h1 text-text-primary">{name}</h1>
            {is_default && <Badge color="info">Default</Badge>}
          </div>
          <p className="text-body-sm text-text-secondary">
            Version {version}. You can look at this form but not change it. Changing forms needs the Manage templates
            permission; ask your {org} admin if you need it.
          </p>
        </div>
        <Card>
          <p className="text-body-sm font-medium text-text-primary">Fields</p>
          <div className="mt-sm">
            <FormFieldsPreview fields={fields} readOnly />
          </div>
        </Card>
      </div>
    </AppShell>
  )
}
