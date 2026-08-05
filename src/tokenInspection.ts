import type { AdminToken } from './types/domain'

const TOKEN_STATUS_ENABLED = 1
const USER_STATUS_ENABLED = 1
const ADMIN_ROLE = 10
const GENERIC_DEVICE_NAMES = new Set(['设备', 'device', 'unknown', '未知'])
const GENERIC_PURPOSES = new Set([
  'test',
  '测试',
  '随便',
  '其他',
  '未知',
  'unknown',
  'default',
  'api',
])

export type TokenInspectionPolicy = {
  allowedClients: string[]
  exemptUserGroups: string[]
  graceHours: number
}

export type TokenNameFinding = {
  tokenId: number
  userId: number
  username: string
  tokenName: string
  userGroup: string
  userRole: number
  verdict: 'ambiguous' | 'non_compliant'
  confidence: number
  violations: string[]
  parsed?: {
    device: string
    client: string
    purpose: string
  }
}

export type TokenInspectionResult = {
  scannedTokens: number
  inspectedTokens: number
  compliantTokens: number
  skippedTokens: number
  protectedTokens: number
  graceTokens: number
  findings: TokenNameFinding[]
}

export type UserTokenFindings = {
  userId: number
  username: string
  userGroup: string
  userRole: number
  findings: TokenNameFinding[]
}

export type TokenNameReview = {
  tokenId: number
  verdict: 'compliant' | 'ambiguous' | 'non_compliant'
  confidence: number
  reason: string
}

export type TokenFindingEvidence = {
  tokenId: number
  tokenName: string
}

function normalizedText(value: string) {
  return value.trim().toLowerCase()
}

function matchesAny(value: string, candidates: string[]) {
  const normalized = normalizedText(value)
  return candidates.some((candidate) => normalizedText(candidate) === normalized)
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

function inspectTokenName(token: AdminToken, policy: TokenInspectionPolicy) {
  const segments = token.name.split('/').map((segment) => segment.trim())
  const violations: string[] = []

  if (segments.length !== 3) {
    violations.push('令牌名称必须使用“设备名称/酒馆或tt酒馆/用途说明”三段式结构')
  }

  const device = segments[0] || ''
  const client = segments[1] || ''
  const purpose = segments[2] || ''
  if (segments.length === 3) {
    if (!device) violations.push('缺少设备名称')
    if (!client || !matchesAny(client, policy.allowedClients)) {
      violations.push('客户端只能填写“酒馆”或“tt酒馆”')
    }
    if (!purpose) violations.push('缺少用途说明')
  }

  const parsed = { device, client, purpose }
  if (!violations.length) {
    const ambiguous =
      GENERIC_DEVICE_NAMES.has(normalizedText(device)) ||
      GENERIC_PURPOSES.has(normalizedText(purpose)) ||
      purpose.length < 2
    if (!ambiguous) return undefined
    return {
      tokenId: token.id,
      userId: token.user_id,
      username: token.username,
      tokenName: token.name,
      userGroup: token.user_group,
      userRole: token.user_role,
      verdict: 'ambiguous' as const,
      confidence: 0.5,
      violations: ['设备名称或用途说明过于笼统，需要 AI 或人工复核'],
      parsed,
    }
  }
  return {
    tokenId: token.id,
    userId: token.user_id,
    username: token.username,
    tokenName: token.name,
    userGroup: token.user_group,
    userRole: token.user_role,
    verdict: 'non_compliant' as const,
    confidence: 1,
    violations,
    ...(segments.length === 3 ? { parsed } : {}),
  }
}

export function inspectTokenNames(
  tokens: AdminToken[],
  policy: TokenInspectionPolicy,
  currentTime = new Date()
): TokenInspectionResult {
  let inspectedTokens = 0
  let compliantTokens = 0
  let skippedTokens = 0
  let protectedTokens = 0
  let graceTokens = 0
  const findings: TokenNameFinding[] = []

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

    inspectedTokens += 1
    const finding = inspectTokenName(token, policy)
    if (!finding) {
      compliantTokens += 1
      continue
    }
    findings.push(finding)
  }

  return {
    scannedTokens: tokens.length,
    inspectedTokens,
    compliantTokens,
    skippedTokens,
    protectedTokens,
    graceTokens,
    findings,
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

export function applyTokenNameReviews(
  findings: TokenNameFinding[],
  reviews: TokenNameReview[]
): TokenNameFinding[] {
  const reviewByTokenId = new Map(
    reviews
      .filter((review) => Number.isInteger(review.tokenId))
      .map((review) => [review.tokenId, review])
  )

  return findings.flatMap((finding) => {
    if (finding.verdict !== 'ambiguous') return [finding]
    const review = reviewByTokenId.get(finding.tokenId)
    if (!review) return [finding]
    const confidence = Math.min(Math.max(Number(review.confidence) || 0, 0), 1)
    if (review.verdict === 'compliant' && confidence >= 0.9) return []
    if (review.verdict !== 'non_compliant') return [finding]

    return [{
      ...finding,
      verdict: 'non_compliant',
      confidence,
      violations: [
        ...finding.violations,
        `AI 复核：${review.reason.trim() || '用途说明不符合命名策略'}`,
      ],
    }]
  })
}

export function matchCurrentTokenEvidence(
  findings: TokenNameFinding[],
  evidence: TokenFindingEvidence[]
) {
  return findings.filter((finding) =>
    evidence.some(
      (item) =>
        item.tokenId === finding.tokenId && item.tokenName === finding.tokenName
    )
  )
}
