import { expect, test } from 'bun:test'
import {
  buildTokenReviewItems,
  reviewCandidatesWithFallback,
  tokenReviewBatches,
  validateBlockVerificationResponse,
  validateIssueOnlyResponse,
} from './tokenInspection'

test('accepts an issue-only response while treating omitted tokens as compliant', () => {
  const candidates = [1, 2, 3, 4].map((tokenId) => ({
    tokenId,
    userId: tokenId,
    username: `user-${tokenId}`,
    tokenName: `name-${tokenId}`,
    tokenGroup: 'default',
    userGroup: 'default',
    userRole: 1,
  }))

  const findings = validateIssueOnlyResponse(
    {
      review_id: 'review-1',
      processed_count: 4,
      issues: [
        {
          token_id: 2,
          severity: 'review',
          confidence: 0.91,
          reason_code: 'missing_device',
          reason: '识别到客户端和用途，但缺少设备信息',
        },
      ],
    },
    { reviewId: 'review-1', candidates }
  )

  expect(findings).toEqual([
    {
      ...candidates[1],
      verdict: 'ambiguous',
      severity: 'review',
      confidence: 0.91,
      reasonCode: 'missing_device',
      violations: ['识别到客户端和用途，但缺少设备信息'],
      blockVerified: false,
    },
  ])
})

test('ignores hallucinated issue IDs outside the current batch', () => {
  const candidate = {
    tokenId: 1,
    userId: 1,
    username: 'user-1',
    tokenName: '本地酒馆RP',
    tokenGroup: 'default',
    userGroup: 'default',
    userRole: 1,
  }

  const findings = validateIssueOnlyResponse({
    review_id: 'review-extra-id',
    processed_count: 1,
    issues: [
      {
        token_id: 7550,
        severity: 'block',
        confidence: 0.999,
        reason_code: 'hallucinated',
        reason: '不属于当前批次',
      },
      {
        token_id: 1,
        severity: 'review',
        confidence: 0.9,
        reason_code: 'ambiguous_purpose',
        reason: '用途需要人工确认',
      },
    ],
  }, {
    reviewId: 'review-extra-id',
    candidates: [candidate],
  })

  expect(findings).toEqual([{
    ...candidate,
    verdict: 'ambiguous',
    severity: 'review',
    confidence: 0.9,
    reasonCode: 'ambiguous_purpose',
    violations: ['用途需要人工确认'],
    blockVerified: false,
  }])
})

test('sends the token group and backend-selected policy route to AI', () => {
  const candidates = [
    { tokenId: 1, tokenGroup: 'default' },
    { tokenId: 2, tokenGroup: '代码' },
    { tokenId: 3, tokenGroup: 'code' },
  ].map(({ tokenId, tokenGroup }) => ({
    tokenId,
    userId: tokenId,
    username: `user-${tokenId}`,
    tokenName: `name-${tokenId}`,
    tokenGroup,
    userGroup: 'default',
    userRole: 1,
  }))

  expect(buildTokenReviewItems(candidates)).toEqual([
    { token_id: 1, user_id: 1, name: 'name-1', token_group: 'default', policy: 'tavern' },
    { token_id: 2, user_id: 2, name: 'name-2', token_group: '代码', policy: 'code' },
    { token_id: 3, user_id: 3, name: 'name-3', token_group: 'code', policy: 'out_of_scope' },
  ])
})

test('omits out-of-scope token groups even if AI returns an issue', () => {
  const candidate = {
    tokenId: 8,
    userId: 8,
    username: 'user-8',
    tokenName: 'some-purpose',
    tokenGroup: '其他',
    userGroup: 'default',
    userRole: 1,
  }

  const findings = validateIssueOnlyResponse({
    review_id: 'review-out-of-scope',
    processed_count: 1,
    issues: [{
      token_id: 8,
      severity: 'review',
      confidence: 1,
      reason_code: 'ignored_scope',
      reason: '范围外分组',
    }],
  }, {
    reviewId: 'review-out-of-scope',
    candidates: [candidate],
  })

  expect(findings).toEqual([])
})

test('downgrades a low-confidence block label to manual review', () => {
  const candidate = {
    tokenId: 7,
    userId: 7,
    username: 'user-7',
    tokenName: 'uncertain-name',
    tokenGroup: 'default',
    userGroup: 'default',
    userRole: 1,
  }

  const [finding] = validateIssueOnlyResponse({
    review_id: 'review-low-block',
    processed_count: 1,
    issues: [{
      token_id: 7,
      severity: 'block',
      confidence: 0.97,
      reason_code: 'other_client',
      reason: '疑似其他客户端，但证据不足',
    }],
  }, {
    reviewId: 'review-low-block',
    candidates: [candidate],
  })

  expect(finding?.severity).toBe('review')
  expect(finding?.verdict).toBe('ambiguous')
})

test('limits token reviews to batches of 100', () => {
  const candidates = Array.from({ length: 205 }, (_, index) => ({
    tokenId: index + 1,
    userId: index + 1,
    username: `user-${index + 1}`,
    tokenName: `name-${index + 1}`,
    tokenGroup: 'default',
    userGroup: 'default',
    userRole: 1,
  }))

  expect(tokenReviewBatches(candidates).map((batch) => batch.length)).toEqual([
    100,
    100,
    5,
  ])
})

test('splits a failed 100-token review down to complete 25-token retries', async () => {
  const candidates = Array.from({ length: 100 }, (_, index) => ({
    tokenId: index + 1,
    userId: index + 1,
    username: `user-${index + 1}`,
    tokenName: `name-${index + 1}`,
    tokenGroup: 'default',
    userGroup: 'default',
    userRole: 1,
  }))
  const batchSizes: number[] = []

  const findings = await reviewCandidatesWithFallback(
    candidates,
    async (batch) => {
      batchSizes.push(batch.length)
      if (batch.length > 25) throw new Error('processed_count mismatch')
      return batch[0]
        ? [{
            ...batch[0],
            verdict: 'ambiguous' as const,
            severity: 'review' as const,
            confidence: 0.9,
            reasonCode: 'sample',
            violations: ['sample issue'],
            blockVerified: false,
          }]
        : []
    }
  )

  expect(batchSizes).toEqual([100, 50, 25, 25, 50, 25, 25])
  expect(findings.map((finding) => finding.tokenId)).toEqual([1, 26, 51, 76])
})

test('requires a second-pass decision for every direct-block candidate', () => {
  const candidates = [1, 2].map((tokenId) => ({
    tokenId,
    userId: tokenId,
    username: `user-${tokenId}`,
    tokenName: `bad-${tokenId}`,
    tokenGroup: 'default',
    userGroup: 'default',
    userRole: 1,
  }))
  const incomplete = {
    review_id: 'verify-1',
    processed_count: 2,
    issues: [{
      token_id: 1,
      severity: 'block',
      confidence: 0.995,
      reason_code: 'unrelated_usage',
      reason: '明确是其他用途',
    }],
  }

  expect(() => validateBlockVerificationResponse(incomplete, {
    reviewId: 'verify-1',
    candidates,
  })).toThrow('must return every candidate')
})
