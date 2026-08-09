import { describe, expect, test } from 'bun:test'
import {
  createOpsAction,
  reconcileTokenInspectionActions,
} from './actions'
import {
  groupTokenFindingsByUser,
  matchCurrentTokenEvidence,
  selectTokenInspectionCandidates,
  summarizeUserTokenFindings,
  tokenPolicyRouteForGroup,
} from './tokenInspection'

function token(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    user_id: 1,
    name: '本地运行酒馆rp',
    status: 1,
    created_time: 1_700_000_000,
    accessed_time: 0,
    username: 'user-1',
    user_status: 1,
    user_role: 1,
    user_group: 'default',
    token_group: 'default',
    ...overrides,
  }
}

const policy = {
  allowedClients: ['酒馆', 'tt酒馆'],
  exemptUserGroups: [] as string[],
  graceHours: 0,
}

describe('selectTokenInspectionCandidates', () => {
  test('sends every eligible free-form token name to AI without strict parsing', () => {
    const names = [
      '本地运行酒馆rp',
      '手机本地TauriTavern酒馆RP',
      '本地|ST酒馆|插件总结',
      '本地TT数据库召回',
    ]
    const result = selectTokenInspectionCandidates(
      names.map((name, index) => token({
        id: index + 1,
        user_id: index + 1,
        username: `user-${index + 1}`,
        name,
      })),
      policy
    )

    expect(result.candidates.map((candidate) => candidate.tokenName)).toEqual(
      names
    )
    expect(result.candidates.every(
      (candidate) => candidate.tokenGroup === 'default'
    )).toBe(true)
    expect(result.inspectedTokens).toBe(4)
  })

  test('routes only the exact 代码 token group to the code naming policy', () => {
    expect(tokenPolicyRouteForGroup('default')).toBe('tavern')
    expect(tokenPolicyRouteForGroup(' DEFAULT ')).toBe('tavern')
    expect(tokenPolicyRouteForGroup('代码')).toBe('code')
    expect(tokenPolicyRouteForGroup(' 代码 ')).toBe('code')
    expect(tokenPolicyRouteForGroup('code')).toBe('out_of_scope')
    expect(tokenPolicyRouteForGroup('其他')).toBe('out_of_scope')
  })

  test('inherits the user group when the token group is empty', () => {
    const result = selectTokenInspectionCandidates(
      [token({ token_group: undefined })],
      policy
    )

    expect(result.candidates[0]?.tokenGroup).toBe('default')
    expect(tokenPolicyRouteForGroup(
      result.candidates[0]?.tokenGroup || ''
    )).toBe('tavern')

  })

  test('sends only default and 代码 groups to AI', () => {
    const result = selectTokenInspectionCandidates(
      [
        token({ id: 1, token_group: 'default' }),
        token({ id: 2, token_group: '代码' }),
        token({ id: 3, token_group: '向量模型' }),
        token({ id: 4, token_group: 'RP' }),
        token({ id: 5, token_group: '', user_group: 'default' }),
      ],
      policy
    )

    expect(result.candidates.map((candidate) => candidate.tokenGroup)).toEqual([
      'default',
      '代码',
      'default',
    ])
    expect(result.outOfScopeTokens).toBe(2)
  })

  test('skips disabled and protected users before sending names to AI', () => {
    const result = selectTokenInspectionCandidates(
      [
        token({ id: 1, status: 2 }),
        token({ id: 2, user_role: 10 }),
        token({ id: 3, user_group: ' SVIP ' }),
      ],
      policy
    )

    expect(result.skippedTokens).toBe(1)
    expect(result.protectedTokens).toBe(2)
    expect(result.candidates).toEqual([])
  })

  test('gives newly created tokens the configured rename grace period', () => {
    const result = selectTokenInspectionCandidates(
      [token({
        created_time: Date.parse('2026-08-05T00:00:00Z') / 1000,
      })],
      { ...policy, graceHours: 24 },
      new Date('2026-08-05T12:00:00Z')
    )

    expect(result.graceTokens).toBe(1)
    expect(result.candidates).toEqual([])
  })
})

test('groups multiple AI findings into one user review', () => {
  const base = {
    userId: 9,
    username: 'same-user',
    userGroup: 'default',
    userRole: 1,
    tokenGroup: 'default',
    verdict: 'ambiguous' as const,
    severity: 'review' as const,
    confidence: 0.9,
    reasonCode: 'missing_device',
    violations: ['缺少设备'],
    blockVerified: false,
  }
  const groups = groupTokenFindingsByUser([
    { ...base, tokenId: 41, tokenName: 'bad-one' },
    { ...base, tokenId: 42, tokenName: 'bad-two' },
  ])

  expect(groups).toHaveLength(1)
  expect(groups[0]?.findings.map((finding) => finding.tokenId)).toEqual([41, 42])
})

test('only twice-confirmed high-confidence blocks qualify a user for auto-disable', () => {
  const base = {
    userId: 9,
    username: 'same-user',
    userGroup: 'default',
    userRole: 1,
    tokenGroup: 'default',
    reasonCode: 'other_client',
    violations: ['明确用于其他客户端'],
  }
  const findings = [
    {
      ...base,
      tokenId: 41,
      tokenName: 'uncertain',
      verdict: 'ambiguous' as const,
      severity: 'review' as const,
      confidence: 0.99,
      blockVerified: false,
    },
    {
      ...base,
      tokenId: 42,
      tokenName: 'verified-but-below-threshold',
      verdict: 'non_compliant' as const,
      severity: 'block' as const,
      confidence: 0.98,
      blockVerified: true,
    },
  ]

  expect(summarizeUserTokenFindings(findings, 0.99)).toEqual({
    reviewCount: 1,
    verifiedBlockCount: 1,
    autoDisableEligibleCount: 0,
  })

  expect(summarizeUserTokenFindings([
    ...findings,
    {
      ...base,
      tokenId: 43,
      tokenName: 'verified-high-confidence',
      verdict: 'non_compliant' as const,
      severity: 'block' as const,
      confidence: 0.995,
      blockVerified: true,
    },
  ], 0.99).autoDisableEligibleCount).toBe(1)

  expect(summarizeUserTokenFindings([{
    ...base,
    tokenId: 44,
    tokenName: 'low-confidence-block',
    verdict: 'non_compliant' as const,
    severity: 'block' as const,
    confidence: 0.97,
    blockVerified: true,
  }], 0.5).autoDisableEligibleCount).toBe(0)
})

test('creates a user-targeted disable action without channel identity', () => {
  const action = createOpsAction(
    {
      action: 'disable_user',
      target: 'alice',
      user_id: 77,
      username: 'alice',
      risk: 'high',
      requires_confirm: true,
      reason: 'invalid token name',
      payload: {
        findings: [{
          tokenId: 91,
          tokenName: 'bad-name',
          tokenGroup: 'default',
        }],
      },
    },
    0,
    'token_inspection'
  )

  expect(action.userId).toBe(77)
  expect(action.username).toBe('alice')
  expect(action.channelId).toBeUndefined()
  expect(action.channelName).toBeUndefined()
})

test('replaces stale open token-inspection actions after a successful run', () => {
  const tokenAction = (
    userId: number,
    source: 'token_inspection' | 'report' = 'token_inspection'
  ) =>
    createOpsAction({
      action: source === 'token_inspection' ? 'disable_user' : 'test_channel',
      target: `target-${userId}`,
      user_id: userId,
      channel_id: source === 'token_inspection' ? undefined : userId,
      risk: 'medium',
      requires_confirm: true,
      reason: 'test action',
    }, userId, source)

  const staleDefault = tokenAction(1)
  const staleVector = tokenAction(2)
  const executing = {
    ...tokenAction(4),
    status: 'executing' as const,
  }
  const unrelated = tokenAction(3, 'report')
  const currentDefault = tokenAction(1)

  expect(reconcileTokenInspectionActions(
    [staleDefault, staleVector, executing, unrelated],
    [currentDefault]
  ).map((action) => action.id)).toEqual([
    currentDefault.id,
    executing.id,
    unrelated.id,
  ])
})

test('invalidates approval evidence after the token name or group changes', () => {
  const current = [{
    tokenId: 61,
    userId: 12,
    username: 'renamed-user',
    tokenName: 'still-bad-but-different',
    tokenGroup: '代码',
    userGroup: 'default',
    userRole: 1,
  }]

  expect(matchCurrentTokenEvidence(current, [
    { tokenId: 61, tokenName: 'old-bad-name', tokenGroup: '代码' },
  ])).toEqual([])
  expect(matchCurrentTokenEvidence(current, [
    {
      tokenId: 61,
      tokenName: 'still-bad-but-different',
      tokenGroup: 'default',
    },
  ])).toEqual([])
  expect(matchCurrentTokenEvidence(current, [
    {
      tokenId: 61,
      tokenName: 'still-bad-but-different',
      tokenGroup: '代码',
    },
  ])).toEqual(current)
})
