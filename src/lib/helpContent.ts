export interface HelpTopic {
  matches: (pathname: string) => boolean
  title: string
  body: string[]
}

// Contextual Help Drawer (build reference 1.22/2.2) — "a '?' icon on pages with real complexity,
// opening a static instructions panel." Only pages with a genuine multi-step flow or a
// non-obvious rule get an entry here; plain list/CRUD pages don't need one.
const HELP_TOPICS: HelpTopic[] = [
  {
    matches: (p) => p === '/activity',
    title: 'Activity',
    body: [
      "Step Approvals lists every submitted step awaiting review — clicking one opens that client's Plan tab with the step already selected, where you review the submission and Confirm Complete or Send Back.",
      '"Send Back" requires a reason — it’s shown to the applicant, so make it specific enough for them to act on.',
      'The counter next to Activity in the sidebar totals everything here that needs action today: pending step approvals, overdue steps, and open tasks due today or earlier.',
    ],
  },
  {
    matches: (p) => p === '/administration/commission-details',
    title: 'Commission & Payments',
    body: [
      'The running total is what your consultancy currently owes Sentpo.',
      'A due marked "Reopened after recognition" was corrected after it was already counted — worth double-checking before you pay it off.',
      '"Declare Payment" records that you’ve paid — it doesn’t confirm instantly. Sentpo finance reviews it before a receipt is issued.',
    ],
  },
  {
    matches: (p) => p.startsWith('/administration/forms/'),
    title: 'Building a Form',
    body: [
      'Every form must link to a Plan Template — choose it when creating the form, since it can’t be changed afterward.',
      'Add fields one at a time; each needs a label and a type. Select-type fields take comma-separated options; Table fields build their own columns.',
      'Fields can be removed but not edited in place — remove and re-add to change one.',
    ],
  },
  {
    // Client Profile (/clients/:id) but not the /clients list or its invoices/receipts siblings.
    // User-requested (2026-08-20) — "In help we should mention how a cross consultancy transfer
    // can be done": the action itself is deliberately buried, so Help is where the process lives.
    matches: (p) => /^\/clients\/[^/]+$/.test(p) && !['/clients/invoices', '/clients/receipts'].includes(p),
    title: 'Client Profile',
    body: [
      'Transfer Consultant (on the Clients List) moves a client between consultants inside your own consultancy — use it for everyday reassignment.',
      "Transferring an applicant to ANOTHER consultancy is different and deliberate: ask the RECEIVING consultancy to issue a one-time transfer code from their own console (Consultancy Management → Incoming Transfers), bound to this student's registered email. Their code is their consent to accept the case; codes expire after 72 hours.",
      'Then open the Overview tab and use the "Transfer applicant to another consultancy" link at the bottom of the page — pick the receiving consultancy, give a reason, enter their code, and type TRANSFER to confirm.',
      'The transfer closes the case on your side permanently ("switched") and it drops off your Clients List — the receiving consultancy onboards the student fresh. This cannot be undone from your side.',
    ],
  },
  {
    matches: (p) => p === '/admin/applicant-allocation',
    title: 'Allocating Applicants',
    body: [
      'This queue combines freelancer-sourced applicants with students who asked to change consultancy — the reason badge tells you which.',
      'Only active consultancies appear in the target list.',
      'Allocating is immediate and final for that applicant — there’s no confirmation step, so check the target before clicking.',
    ],
  },
  {
    matches: (p) => p === '/admin/course-suggestions-review',
    title: 'Reviewing Course Suggestions',
    body: [
      '"New Course" suggestions create a brand-new catalog entry when approved.',
      '"Correction" suggestions edit an existing course instead — same Approve button, different effect, so check the type badge first.',
      'Rejecting requires a reason, which is stored and shown if you revisit the item later.',
    ],
  },
]

export function getHelpTopic(pathname: string): HelpTopic | undefined {
  return HELP_TOPICS.find((topic) => topic.matches(pathname))
}
