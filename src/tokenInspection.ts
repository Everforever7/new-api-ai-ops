import type { AdminToken } from './types/domain'

const TOKEN_STATUS_ENABLED = 1
const USER_STATUS_ENABLED = 1
const ADMIN_ROLE = 10

export type TokenInspectionPolicy = {
  allowedClients: string[]
  exemptUserGroups: string[]
  graceHours: number
}

export type TokenPolicyRoute = 'tavern' | 'code' | 'manual_review'

export type TokenInspectionCandidate = {
  tokenId: number
  userId: number
  username: string
  tokenName: string
  tokenGroup: string
  userGroup: string
  userRole: number
}

export type TokenInspectionSelection = {
  scannedTokens: number
  inspectedTokens: number
  skippedTokens: number
  protectedTokens: number
  graceTokens: number
  candidates: TokenInspectionCandidate[]
}

export type TokenNameFinding = {
  tokenId: number
  userId: number
  username: string
  tokenName: string
  tokenGroup: string
  userGroup: string
  userRole: number
  verdict: 'ambiguous' | 'non_compliant'
  severity?: 'review' | 'block'
  confidence: number
  reasonCode?: string
  blockVerified?: boolean
  violations: string[]
}

export type UserTokenFindings = {
  userId: number
  username: string
  userGroup: string
  userRole: number
  findings: TokenNameFinding[]
}

export type TokenFindingEvidence = {
  tokenId: number
  tokenName: string
  tokenGroup: string
}

function normalizedText(value: string) {
  return value.trim().toLowerCase()
}

function matchesAny(value: string, candidates: string[]) {
  const normalized = normalizedText(value)
  return candidates.some((candidate) => normalizedText(candidate) === normalized)
}

export function tokenPolicyRouteForGroup(
  tokenGroup: string
): TokenPolicyRoute {
  const normalized = normalizedText(tokenGroup)
  if (normalized === 'default') return 'tavern'
  if (tokenGroup.trim() === '代码') return 'code'
  return 'manual_review'
}

function isProtected(token: AdminToken, policy: TokenInspectionPolicy) {
  return (
    token.user_role >= ADMIN_ROLE ||
    normalizedText(token.user_group) === 'svip' ||
    matchesAny(token.user_group, policy.exemptUserGroups)
  )
}

function withinGracePeriod(
  token: AdminToken,
  policy: TokenInspectionPolicy,
  currentTime: Date
) {
  if (policy.graceHours <= 0 || token.created_time <= 0) return false
  const createdAtMs = token.created_time * 1000
  return currentTime.getTime() - createdAtMs < policy.graceHours * 60 * 60 * 1000
}

export function selectTokenInspectionCandidates(
  tokens: AdminToken[],
  policy: TokenInspectionPolicy,
  currentTime = new Date()
): TokenInspectionSelection {
  let skippedTokens = 0
  let protectedTokens = 0
  let graceTokens = 0
  const candidates: TokenInspectionCandidate[] = []

  for (const token of tokens) {
    if (token.status !== TOKEN_STATUS_ENABLED || token.user_status !== USER_STATUS_ENABLED) {
      skippedTokens += 1
      continue
    }
    if (isProtected(token, policy)) {
      protectedTokens += 1
      continue
    }
    if (withinGracePeriod(token, policy, currentTime)) {
      graceTokens += 1
      continue
    }
    candidates.push({
      tokenId: token.id,
      userId: token.user_id,
      username: token.username,
      tokenName: token.name,
      tokenGroup: String(token.token_group || token.user_group || '').trim(),
      userGroup: token.user_group,
      userRole: token.user_role,
    })
  }

  return {
    scannedTokens: tokens.length,
    inspectedTokens: candidates.length,
    skippedTokens,
    protectedTokens,
    graceTokens,
    candidates,
  }
}

export function groupTokenFindingsByUser(
  findings: TokenNameFinding[]
): UserTokenFindings[] {
  const grouped = new Map<number, UserTokenFindings>()
  for (const finding of findings) {
    const existing = grouped.get(finding.userId)
    if (existing) {
      existing.findings.push(finding)
      continue
    }
    grouped.set(finding.userId, {
      userId: finding.userId,
      username: finding.username,
      userGroup: finding.userGroup,
      userRole: finding.userRole,
      findings: [finding],
    })
  }
  return [...grouped.values()]
}

export function summarizeUserTokenFindings(
  findings: TokenNameFinding[],
  autoDisableConfidence: number
) {
  const effectiveThreshold = Math.max(0.98, autoDisableConfidence)
  let verifiedBlockCount = 0
  let autoDisableEligibleCount = 0
  for (const finding of findings) {
    if (finding.severity !== 'block' || finding.blockVerified !== true) continue
    verifiedBlockCount += 1
    if (finding.confidence >= effectiveThreshold) {
      autoDisableEligibleCount += 1
    }
  }
  return {
    reviewCount: findings.length - verifiedBlockCount,
    verifiedBlockCount,
    autoDisableEligibleCount,
  }
}

export function matchCurrentTokenEvidence(
  findings: Array<Pick<
    TokenInspectionCandidate,
    'tokenId' | 'tokenName' | 'tokenGroup'
  >>,
  evidence: TokenFindingEvidence[]
) {
  return findings.filter((finding) =>
    evidence.some(
      (item) =>
        item.tokenId === finding.tokenId &&
        item.tokenName === finding.tokenName &&
        normalizedText(item.tokenGroup) === normalizedText(finding.tokenGroup)
    )
  )
}
