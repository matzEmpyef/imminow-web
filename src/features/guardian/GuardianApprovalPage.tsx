import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { TextField } from '@/components/TextField'
import { useGuardianDecision, useGuardianPrompt, useGuardianWithdraw } from '@/queries/guardianConsent'

// The page a parent lands on from the message Sentpo sent them (2026-09-05). Public, no account,
// no console chrome — the person reading this has never heard of immiNow and is answering one
// question about their child, so the sidebar, the brand and the navigation all stay away.
//
// It carries no immiNow logo on purpose: the account being approved is a Sentpo one, and showing a
// parent a brand they have no relationship with is how a legitimate message starts looking like a
// phishing attempt.
//
// What it must never do is leak the child's data. The payload behind it is a first name and an
// age; anyone holding a forwarded link learns nothing more than the message already told them.

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-md py-xl">
      <Card className="w-full max-w-[32rem] border border-border">
        <p className="text-caption uppercase tracking-wide text-text-secondary">Sentpo</p>
        <h1 className="mt-xs text-h1 text-text-primary">{title}</h1>
        <div className="mt-lg flex flex-col gap-md">{children}</div>
      </Card>
    </div>
  )
}

export function GuardianApprovalPage() {
  const { token = '' } = useParams()
  const prompt = useGuardianPrompt(token)
  const decision = useGuardianDecision(token)
  const withdraw = useGuardianWithdraw(token)
  const [name, setName] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [touched, setTouched] = useState(false)

  if (prompt.isLoading) return <Shell title="Loading…">{null}</Shell>

  if (prompt.isError || !prompt.data) {
    return (
      <Shell title="This link is not valid">
        <p className="text-body text-text-secondary">
          Approval links last a week and can only be used once. If your child is still waiting, they can send
          you a fresh one from the Sentpo app.
        </p>
      </Shell>
    )
  }

  const { student_first_name: student, student_age: age, status } = prompt.data

  if (status === 'approved') {
    return (
      <Shell title={`You approved ${student}'s account`}>
        <p className="text-body text-text-secondary">
          {student} can now talk to a consultancy, share documents with the one they choose, and attend
          in-person meetings. You can change your mind at any time.
        </p>
        {withdraw.isError && (
          <p className="text-body-sm text-danger">Could not withdraw your approval. Please try again.</p>
        )}
        <Button variant="secondary" loading={withdraw.isPending} onClick={() => withdraw.mutate()}>
          Withdraw my approval
        </Button>
        <p className="text-caption text-text-secondary">
          Withdrawing pauses those things again. {student} keeps their account and can still search courses
          and read articles.
        </p>
      </Shell>
    )
  }

  if (status === 'withdrawn') {
    return (
      <Shell title="Your approval has been withdrawn">
        <p className="text-body text-text-secondary">
          {student} can still search courses, read articles and save the ones they like, but cannot talk to a
          consultancy, share documents or attend meetings until a parent or guardian approves again.
        </p>
      </Shell>
    )
  }

  if (status === 'declined') {
    return (
      <Shell title="You declined">
        <p className="text-body text-text-secondary">
          Nothing has changed for {student} beyond what was already paused. They can still search courses and
          read articles, and they can ask another parent or guardian instead.
        </p>
      </Shell>
    )
  }

  if (status === 'expired') {
    return (
      <Shell title="This link has expired">
        <p className="text-body text-text-secondary">
          Approval links last a week. {student} can send you a new one from the Sentpo app.
        </p>
      </Shell>
    )
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!name.trim() || !confirmed) return
    decision.mutate({ decision: 'approve', guardian_name: name.trim(), confirms_adult_guardian: true })
  }

  return (
    <Shell title={`Approve ${student}'s Sentpo account`}>
      <p className="text-body text-text-primary">
        {student}
        {age != null ? `, who is ${age},` : ''} has asked you to approve their account. Sentpo helps students
        find courses abroad and talk to verified education consultancies.
      </p>

      <div className="rounded-md border border-border bg-background p-md">
        <p className="text-body-sm font-medium text-text-primary">What approving allows</p>
        <ul className="mt-xs flex list-disc flex-col gap-xs pl-lg text-body-sm text-text-secondary">
          <li>Messaging a consultancy they choose, who will see their name and study preferences.</li>
          <li>Committing to one consultancy, which then also sees their contact details and address.</li>
          <li>Uploading documents such as transcripts for an application.</li>
          <li>Attending an in-person meeting or fair.</li>
        </ul>
        <p className="mt-sm text-body-sm font-medium text-text-primary">What stays true either way</p>
        <ul className="mt-xs flex list-disc flex-col gap-xs pl-lg text-body-sm text-text-secondary">
          <li>Sentpo shows them no advertising and keeps no usage analytics while they are under 18.</li>
          <li>Nothing is sold to anyone.</li>
          <li>You can withdraw this approval at any time from the link we email you.</li>
        </ul>
      </div>

      <form className="flex flex-col gap-md" onSubmit={handleSubmit} noValidate>
        <TextField
          label="Your full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={touched && !name.trim() ? 'Please enter your name.' : undefined}
        />
        <label className="flex items-start gap-sm text-body-sm text-text-primary">
          <input
            type="checkbox"
            className="mt-[3px]"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>
            I am {student}&apos;s parent or legal guardian and I am over 18.
            {touched && !confirmed && (
              <span className="block text-danger">Please confirm this before approving.</span>
            )}
          </span>
        </label>

        {decision.isError && (
          <p className="text-body-sm text-danger">Could not record your answer. Please try again.</p>
        )}

        <div className="flex flex-col gap-sm sm:flex-row">
          <Button type="submit" loading={decision.isPending}>
            Approve
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={decision.isPending}
            onClick={() => {
              setTouched(true)
              if (!name.trim()) return
              decision.mutate({
                decision: 'decline',
                guardian_name: name.trim(),
                confirms_adult_guardian: true,
              })
            }}
          >
            Decline
          </Button>
        </div>
        <p className="text-caption text-text-secondary">
          Declining does not delete {student}&apos;s account. They can still search courses and read articles.
        </p>
      </form>
    </Shell>
  )
}
