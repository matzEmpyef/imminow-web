import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { AppShell } from '@/features/auth/AppShell'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { Modal } from '@/components/Modal'
import { Table, type TableColumn } from '@/components/Table'
import { useDeletePhonebookContact, usePhonebook } from '@/queries/phonebook'
import { AddPhonebookContactModal } from './AddPhonebookContactModal'

type Contact = NonNullable<ReturnType<typeof usePhonebook>['data']>[number]

export function PhonebookPage() {
  const contacts = usePhonebook()
  const deleteContact = useDeletePhonebookContact()
  const [showAddModal, setShowAddModal] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null)

  const categories = [...new Set(contacts.data?.map((c) => c.category) ?? [])]

  const rows = useMemo(() => {
    let items = contacts.data ?? []
    if (categoryFilter) items = items.filter((c) => c.category === categoryFilter)
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          (c.email ?? '').toLowerCase().includes(q),
      )
    }
    if (sort) {
      const dir = sort.direction === 'desc' ? -1 : 1
      items = [...items].sort((a, b) => {
        const av = (a[sort.field as 'name' | 'category'] ?? '').toLowerCase()
        const bv = (b[sort.field as 'name' | 'category'] ?? '').toLowerCase()
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    }
    return items
  }, [contacts.data, categoryFilter, search, sort])

  const columns: TableColumn<Contact>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (c) => <span className="font-medium text-text-primary">{c.name}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      render: (c) => <Badge color="secondary">{c.category}</Badge>,
    },
    { key: 'phone', header: 'Phone', render: (c) => c.phone },
    { key: 'email', header: 'Email', render: (c) => c.email || <span className="text-text-secondary">—</span> },
    {
      key: 'actions',
      header: '',
      render: (c) => (
        <div className="flex justify-end">
          <button
            onClick={() => setDeletingContact(c)}
            aria-label={`Remove ${c.name}`}
            className="flex h-9 w-9 items-center justify-center rounded-md text-error hover:bg-error/10"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h1 text-text-primary">Phonebook</h1>
            <p className="text-body-sm text-text-secondary">External contacts — vendors, support services.</p>
          </div>
          <Button onClick={() => setShowAddModal(true)}>Add Contact</Button>
        </div>

        {showAddModal && <AddPhonebookContactModal categories={categories} onClose={() => setShowAddModal(false)} />}

        {deletingContact && (
          <Modal
            onClose={() => setDeletingContact(null)}
            title="Delete Contact"
            widthRem={24}
            footer={
              <div className="flex justify-end gap-sm">
                <Button variant="secondary" onClick={() => setDeletingContact(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  loading={deleteContact.isPending}
                  onClick={() =>
                    deleteContact.mutate(deletingContact.id, { onSuccess: () => setDeletingContact(null) })
                  }
                >
                  Delete
                </Button>
              </div>
            }
          >
            <div className="flex flex-col gap-md">
              <p className="text-body-sm text-text-primary">
                Are you sure you want to delete <span className="font-medium">{deletingContact.name}</span>? This can't
                be undone.
              </p>
              {deleteContact.isError && <p className="text-body-sm text-error">{deleteContact.error.message}</p>}
            </div>
          </Modal>
        )}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          loading={contacts.isLoading}
          emptyMessage="No contacts yet."
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search contacts…' }}
          filters={
            categories.length > 0 ? (
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Category"
                className="ml-auto h-10 rounded-md border border-border bg-background px-3 text-body-sm"
              >
                <option value="">All</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            ) : undefined
          }
        />
      </div>
    </AppShell>
  )
}
