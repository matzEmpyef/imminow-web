import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { Combobox } from '@/components/Combobox'
import { useCreatePhonebookContact } from '@/queries/phonebook'
import { EMAIL_ERROR, PHONE_ERROR, isValidEmail, isValidPhone } from '@/lib/validation'

// `categories` populates the Category combobox's dropdown — existing categories are pickable
// like a normal select, but typing something new and pressing Enter (or clicking "+ Add") just
// uses that value, since there's no separate "manage categories" concept to maintain.
export function AddPhonebookContactModal({ categories, onClose }: { categories: string[]; onClose: () => void }) {
  const createContact = useCreatePhonebookContact()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  const phoneError = phone && !isValidPhone(phone) ? PHONE_ERROR : undefined
  const emailError = email && !isValidEmail(email) ? EMAIL_ERROR : undefined
  const canSubmit = Boolean(name && category && phone) && !phoneError && !emailError

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    createContact.mutate({ name, category, phone, email: email || undefined }, { onSuccess: onClose })
  }

  return (
    <Modal
      onClose={onClose}
      title="Add Contact"
      footer={
        <>
          {createContact.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{createContact.error.message}</p>
          )}
          <Button
            type="submit"
            form="add-phonebook-contact-form"
            loading={createContact.isPending}
            disabled={!canSubmit}
          >
            Add Contact
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
