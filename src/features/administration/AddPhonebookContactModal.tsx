import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { Combobox } from '@/components/Combobox'
import { useCreatePhonebookContact, useUpdatePhonebookContact } from '@/queries/phonebook'
import { EMAIL_ERROR, PHONE_ERROR, isValidEmail, isValidPhone } from '@/lib/validation'
import { showToast } from '@/lib/toast'

// `categories` populates the Category combobox's dropdown — existing categories are pickable
// like a normal select, but typing something new and pressing Enter (or clicking "+ Add") just
// uses that value, since there's no separate "manage categories" concept to maintain.
//
// With `contact` it edits that contact instead (review F-299): the same fields, saved through
// PATCH /phonebook/{id}. Editing is open to all staff, like adding (owner decision 7).
export function AddPhonebookContactModal({
  categories,
  contact,
  onClose,
}: {
  categories: string[]
  contact?: { id: string; name: string; category: string; phone: string; email?: string | null }
  onClose: () => void
}) {
  const createContact = useCreatePhonebookContact()
  const updateContact = useUpdatePhonebookContact(contact?.id ?? '')
  const save = contact ? updateContact : createContact
  const [name, setName] = useState(contact?.name ?? '')
  const [category, setCategory] = useState(contact?.category ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [email, setEmail] = useState(contact?.email ?? '')

  const phoneError = phone && !isValidPhone(phone) ? PHONE_ERROR : undefined
  const emailError = email && !isValidEmail(email) ? EMAIL_ERROR : undefined
  const canSubmit = Boolean(name && category && phone) && !phoneError && !emailError

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    save.mutate(
      // Editing sends the email as it stands, an empty one included, so a removed email is saved.
      { name, category, phone, email: contact ? email : email || undefined },
      {
        onSuccess: () => {
          showToast(contact ? `${name} saved` : `${name} added to phonebook`)
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title={contact ? 'Edit Contact' : 'Add Contact'}
      footer={
        <>
          {save.isError && <p className="mr-auto self-center text-body-sm text-error">{save.error.message}</p>}
          <Button type="submit" form="add-phonebook-contact-form" loading={save.isPending} disabled={!canSubmit}>
            {contact ? 'Save' : 'Add Contact'}
          </Button>
        </>
      }
    >
      <form id="add-phonebook-contact-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Combobox label="Category" value={category} onChange={setCategory} options={categories} required />
        <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} error={phoneError} required />
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
        />
      </form>
    </Modal>
  )
}
