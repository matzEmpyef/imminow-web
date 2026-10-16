import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { Combobox } from '@/components/Combobox'
import { useCreatePhonebookContact, useUpdatePhonebookContact } from '@/queries/phonebook'
import {
  STAFF_PHONE_SENTENCE,
  cleanText,
  emailError as checkEmail,
  isTextOk,
  normaliseEmail,
  phoneError as checkPhone,
  phoneToSend,
} from '@/lib/validation'
import { usePhoneRegion } from '@/lib/phoneRegion'
import { useServerFieldErrors } from '@/lib/useServerFieldErrors'
import { showToast } from '@/lib/toast'
import { StillNeeded } from '@/components/StillNeeded'

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

  const region = usePhoneRegion()
  // A number or an address saved before the rule was one is not flagged until someone edits it.
  const phoneError = phone !== (contact?.phone ?? '') ? checkPhone(phone, region) : undefined
  const emailError = email !== (contact?.email ?? '') ? checkEmail(email) : undefined
  const server = useServerFieldErrors(save.error, { name, category, phone, email })
  const canSubmit =
    Boolean(isTextOk('title', name) && isTextOk('label', category) && phone.trim()) && !phoneError && !emailError
  const stillNeeded = [...(name.trim() ? [] : ['a name']), ...(category.trim() ? [] : ['a category']), ...(phone ? [] : ['a phone number'])]

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    save.mutate(
      // Editing sends the email as it stands, an empty one included, so a removed email is saved.
      {
        name: cleanText(name),
        category: cleanText(category),
        phone: phone === (contact?.phone ?? '') ? phone.trim() : phoneToSend(phone, region),
        email: contact ? normaliseEmail(email) : normaliseEmail(email) || undefined,
      },
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
          {save.isError && !server.allBesideFields && (
            <p className="mr-auto self-center text-body-sm text-error">{save.error.message}</p>
          )}
          <StillNeeded items={stillNeeded} />
          <Button type="submit" form="add-phonebook-contact-form" loading={save.isPending} disabled={!canSubmit}>
            {contact ? 'Save' : 'Add Contact'}
          </Button>
        </>
      }
    >
      <form id="add-phonebook-contact-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField
          kind="title"
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={server.messageFor('name')}
          required
        />
        <Combobox label="Category" value={category} onChange={setCategory} options={categories} required commitWhileTyping />
        <TextField
          label="Phone"
          kind="phone"
          autoCheck={false}
          phoneRegion={region}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={phoneError ?? server.messageFor('phone')}
          hint={STAFF_PHONE_SENTENCE}
          required
        />
        <TextField
          label="Email"
          type="email"
          value={email}
          autoCheck={false}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError ?? server.messageFor('email')}
        />
      </form>
    </Modal>
  )
}
