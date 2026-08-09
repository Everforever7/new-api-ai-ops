import { expect, test } from 'bun:test'
import {
  reviewCandidatesWithFallback,
  validateBlockVerificationResponse,
  validateIssueOnlyResponse,
} from './tokenInspection'

test('accepts an issue-only response while treating omitted tokens as compliant', () => {
  const candidates = [1, 2, 3, 4].map((tokenId) => ({
    tokenId,
    userId: tokenId,
    username: `user-${tokenId}`,
    tokenName: `name-${tokenId}`,
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

test('downgrades a low-confidence block label to manual review', () => {
  const candidate = {
    tokenId: 7,
    userId: 7,
    username: 'user-7',
    tokenName: 'uncertain-name',
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

test('splits a failed 1000-token review down to complete 250-token retries', async () => {
  const candidates = Array.from({ length: 1_000 }, (_, index) => ({
    tokenId: index + 1,
    userId: index + 1,
    username: `user-${index + 1}`,
    tokenName: `name-${index + 1}`,
    userGroup: 'default',
    userRole: 1,
  }))
  const batchSizes: number[] = []

  const findings = await reviewCandidatesWithFallback(
    candidates,
    async (batch) => {
      batchSizes.push(batch.length)
      if (batch.length > 250) throw new Error('processed_count mismatch')
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

  expect(batchSizes).toEqual([1_000, 500, 250, 250, 500, 250, 250])
  expect(findings.map((finding) => finding.tokenId)).toEqual([1, 251, 501, 751])
})

test('requires a second-pass decision for every direct-block candidate', () => {
  const candidates = [1, 2].map((tokenId) => ({
    tokenId,
    userId: tokenId,
    username: `user-${tokenId}`,
    tokenName: `bad-${tokenId}`,
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
