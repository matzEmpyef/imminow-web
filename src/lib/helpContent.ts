export interface HelpSection {
  heading: string
  items: { term: string; text: string }[]
}

export interface HelpTopic {
  matches: (pathname: string) => boolean
  title: string
  body: string[]
  // Named things explained one by one, under a heading — for pages whose question is "what does
  // each of these mean" rather than "how do I do this" (the Dashboard's cards, 2026-09-10).
  sections?: HelpSection[]
}

// Contextual Help Drawer (build reference 1.22/2.2) — "a '?' icon on pages with real complexity,
// opening a static instructions panel." Only pages with a genuine multi-step flow or a
// non-obvious rule get an entry here; plain list/CRUD pages don't need one.
const HELP_TOPICS: HelpTopic[] = [
  {
    // What every card on the consultancy Dashboard counts (user, 2026-09-10). Worded from how the
    // server computes each figure (GET /dashboard) — keep the two in step when either changes.
    matches: (p) => p === '/dashboard',
    title: 'Dashboard',
    body: [
      'The toggle at the top right picks whose numbers you see. Personal counts only the leads and clients assigned to you. Branch counts your branches. Whole Consultancy counts everyone. You only see the views that apply to your role.',
      'Clicking a card opens the list it counts, already filtered to match the number.',
    ],
    sections: [
      {
        heading: 'Cards',
        items: [
          {
            term: 'Unallocated Leads',
            text: 'Students waiting in the Lead Pool who have not been allocated to a consultant yet. A pool lead belongs to no one, so this is always the whole pool, whichever view you pick. No one can reply to these leads until they are allocated.',
          },
          {
            term: 'Active Leads',
            text: 'Leads allocated to a consultant that are still leads: not yet converted to clients and not closed.',
          },
          {
            term: 'Unattended Leads',
            text: 'Active leads where the student sent the last message, so they are waiting on a reply from you.',
          },
          {
            term: 'Clients (Personal view)',
            text: 'The clients assigned to you right now. Closed and completed cases are not counted, the same as the Clients list.',
          },
          {
            term: 'Pending Consultant Allocation (Branch and Whole Consultancy views)',
            text: 'Clients with no consultant assigned. Each one is a student who has committed to your consultancy and is waiting for someone to start their case.',
          },
        ],
      },
      {
        heading: 'Charts',
        items: [
          {
            term: 'Leads Over Time',
            text: 'New leads per day, by the day each lead came in.',
          },
          {
            term: 'Conversion Funnel',
            text: 'All leads in this view, whatever their status, against how many of them converted to clients.',
          },
          {
            term: 'Applicant Status',
            text: 'Your clients, split by the stage their case is at.',
          },
          {
            term: 'New Applicants by Month',
            text: 'How many students became clients in each month.',
          },
          {
            term: 'Branch Breakdown',
            text: "Leads handled by each branch's consultants, across the whole consultancy. Shown only when you have more than one branch.",
          },
        ],
      },
      {
        heading: 'Usage Analytics',
        items: [
          {
            term: 'Response time to new leads',
            text: "The typical (median) time from a lead arriving to a consultant's first reply. Leads no one has replied to yet are left out.",
          },
          {
            term: 'Lead → client conversion time',
            text: 'The typical (median) number of days from a lead arriving to it converting to a client.',
          },
          {
            term: 'Active-Student Engagement',
            text: 'Your committed students grouped by when they last opened the app: within 7 days, 8–30 days, 31 or more days, or never.',
          },
        ],
      },
    ],
  },
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
      'The running total is what your consultancy currently owes immiNow.',
      'A due marked "Reopened after recognition" was corrected after it was already counted — worth double-checking before you pay it off.',
      '"Declare Payment" records that you’ve paid — it doesn’t confirm instantly. immiNow finance reviews it before a receipt is issued.',
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
