# Unified Security Access Management (USAM) — One-Pager

---

## Problem

Security engineers cannot protect what they cannot see. Today, obtaining access to private packages, restricted AWS accounts, and internal resources requires ad-hoc requests to individual builder teams — each with its own approval process, timelines, and willingness to grant access.

The result:

- **Investigations stall** for 2–5 business days waiting on access approvals
- **~30% of security investigations** are blocked or delayed by access friction
- **An estimated 40–60% of resources** have never been reviewed by security
- **No centralized record** of who has access to what, when they got it, or when it expires
- **Standing access is untracked** — no one knows the total number of persistent security access grants

This is not a tooling inconvenience. It is unquantified organizational risk.

---

## Proposal

Build **USAM** — a self-service platform where security engineers request, receive, and relinquish access to any Amazon resource through a standardized, time-bound, and fully auditable workflow.

**How it works:**

1. Engineer defines scope (packages, AWS accounts, repos, environments) and provides business justification linked to a specific ticket or engagement
2. **Two-person review (2PR):** manager approves the need, resource-level approver confirms scope
3. Access is granted for a defined window (default 8 hours, max 30 days)
4. Access is **automatically revoked** on expiration — no manual action required
5. Every action during the access window is logged to an **immutable audit trail**

**No one holds standing access.** Every access event requires fresh justification and approval — regardless of title or tenure.

**Break-glass workflow** for active incidents: auto-approved 4-hour window linked to a SIM/TT ticket, with retroactive review required within 24 hours.

**Automated service access** (e.g., Mycelium, vulnerability scanners): service principals follow the same zero-trust model with scoped permissions and time-bound tokens.

**Anomaly detection** flags: repeated renewals, scope expansion, off-hours access, bulk requests, and unusual resource combinations.

---

## Scope

**In scope:**
- Internal Amazon packages and AWS accounts
- GitHub Enterprise repositories
- Third-party SaaS tools in the build pipeline
- Human and automated (service principal) access
- Web portal and CLI interfaces

**Out of scope:**
- Replacing the Bindles team operational access model
- Physical infrastructure access
- Non-security access workflows

---

## Timeline

| Phase | Target | Deliverable |
|-------|--------|-------------|
| **MVP** | Q3 2026 | Internal packages + AWS accounts. Manual 2PR approval. Web portal. |
| **Automation** | Q4 2026 | Service principals. Policy-based auto-approval for low-sensitivity resources. CLI. |
| **External** | Q1 2027 | GitHub repos. Third-party integrations. Anomaly detection. |
| **Full Enforcement** | Q2 2027 | All standing access migrated. Zero standing access enforced. |

**Estimated build:** 2 engineers, 4 months to MVP (recommended: build on existing Disco infrastructure).

---

## Success Metrics

| Metric | Today | Target (6 months post-launch) |
|--------|-------|-------------------------------|
| Mean time to obtain access | 2–5 business days | < 2 hours (standard), < 15 min (incident) |
| Resources accessible to security | ~40–60% | 100% |
| Standing access grants | Unknown | 0 |
| Access events with full audit trail | < 20% | 100% |
| Investigations blocked by access | ~30% | 0% |

---

## Ask

1. **Feedback from Khaled & Garrett** on solution design and scope validation
2. **Presentation slot with Dan Bailey & James Primo** for technical feasibility review
3. **Alignment from Philip Ribe** on cross-team dependencies
4. **Executive sponsorship from Rush & Magnus** for funding and org-wide mandate

---

## Why Now

- **Compliance exposure is growing.** Auditors increasingly require evidence that security teams can access and review all production systems.
- **Incident response cannot wait.** Hours-long access delays during active incidents directly increase blast radius.
- **Engineer retention.** Access friction is cited as a top frustration by security engineers.
- **Reduced builder interaction.** Builder teams spend hours fielding, triaging, and fulfilling ad-hoc access requests — time taken directly from building. USAM eliminates this overhead with a standardized, self-service workflow.
- **Every unreviewed resource is an unknown vulnerability.** The risk is real — we just cannot measure it yet.
