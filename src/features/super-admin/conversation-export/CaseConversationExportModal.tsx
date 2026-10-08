import { Modal } from '@/components/Modal'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useApplicantCase } from '@/queries/applicantCase'
import { ConversationExportModal } from './ConversationExportModal'

/**
 * The conversation export, opened from a CASE rather than from a student: the Dispute drawer. A
 * dispute carries its case and its consultancy but not the student's account, and the export is
 * asked for by student, so the case is read first (GET /admin/applicants/{id}, open to `support`)
 * to learn whose it is.
 */
export function CaseConversationExportModal({
  journeyId,
  studentName,
  consultancyId,
  onClose,
}: {
  journeyId: string
  studentName: string | null
  consultancyId?: string | null
  onClose: () => void
}) {
  const applicantCase = useApplicantCase(journeyId)
  const studentId = applicantCase.data?.student.id

  if (studentId) {
    return (
      <ConversationExportModal
        student={{ id: studentId, name: studentName ?? applicantCase.data?.student.name ?? null }}
        consultancyId={consultancyId}
        onClose={onClose}
      />
    )
  }
  return (
    <Modal onClose={onClose} title={`Export conversation — ${studentName ?? 'student'}`} widthRem={36} dismissible>
      {applicantCase.isLoading ? (
        <Skeleton className="h-24 rounded-md" />
      ) : (
        <ErrorState
          message="Could not find the student on this case."
          onRetry={() => void applicantCase.refetch()}
          error={applicantCase.error}
        />
      )}
    </Modal>
  )
}
