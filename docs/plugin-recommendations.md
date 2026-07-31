# Plugin Recommendations For The Onboarding Use Case

These plugins are not required for the customer-facing website itself. The core website and backend-for-frontend should remain bank-owned. Plugins are useful around operational workflows, document handling, notifications and internal collaboration.

## Recommended first wave

- `Slack`
  Use for real-time notifications when an application enters manual review, verification stalls, or onboarding operations need attention.

- `Google Drive` or `Box` or `SharePoint`
  Choose one document system of record for sample evidence packs, operations reference documents, onboarding policy packs and non-customer-facing artifacts.

- `Gmail` or `Outlook Email`
  Use for application acknowledgement emails, status updates and follow-up communication once outbound messaging is added.

## Recommended second wave

- `Google Calendar` or `Outlook Calendar`
  Add only if the onboarding journey will offer branch appointments, video KYC sessions or specialist callbacks.

- `Notion`
  Useful for internal onboarding playbooks, exception-handling notes, operating procedures and rollout documentation.

- `Teams`
  Use instead of Slack if the operations and compliance teams already work in Microsoft 365.

## Optional knowledge layer

- `Atlassian Rovo`
  Useful if the team wants AI-assisted retrieval across internal Jira and Confluence knowledge during operations or implementation planning.

## Suggested capability mapping

- Customer communications:
  `Gmail` or `Outlook Email`

- Internal review alerts:
  `Slack` or `Teams`

- Document repository:
  `Google Drive`, `Box` or `SharePoint`

- Appointment scheduling:
  `Google Calendar` or `Outlook Calendar`

- Internal knowledge and runbooks:
  `Notion` or `Atlassian Rovo`

## Practical recommendation

For this use case, the cleanest initial combination is:

1. `Slack` for review and exception alerts
2. `Google Drive` or `SharePoint` for internal document storage
3. `Gmail` or `Outlook Email` for customer communication

That gives the onboarding flow real operational integrations without contaminating the public website with implementation-specific tooling.
