import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const { summarizeReviews } = createRequire(import.meta.url)('../actions/pr-review-stats/review-stats.js')

const review = (login, state) => ({ user: { login }, state })

function summarize({ author = 'author', reviews = [], requestedReviewers = [], requestedTeams = [] }) {
  return summarizeReviews({ author, reviews, requestedReviewers, requestedTeams })
}

test('只留 Comment 的 reviewer 不算通過（mPHR_Frontend#2484）', () => {
  const result = summarize({
    reviews: [
      review('james', 'COMMENTED'),
      review('kent', 'APPROVED'),
      review('hank', 'APPROVED'),
      review('kiva', 'APPROVED'),
      review('james', 'COMMENTED'),
    ],
  })
  assert.deepEqual(result, { reviewersCount: 4, approvedCount: 3, allApproved: false })
})

test('Approve 之後再留 Comment 仍算通過', () => {
  const result = summarize({
    reviews: [review('kent', 'APPROVED'), review('kent', 'COMMENTED')],
  })
  assert.deepEqual(result, { reviewersCount: 1, approvedCount: 1, allApproved: true })
})

test('先 Comment 後 Approve 算通過', () => {
  const result = summarize({
    reviews: [review('kent', 'COMMENTED'), review('kent', 'APPROVED')],
  })
  assert.equal(result.allApproved, true)
})

test('Request changes 之後再 Comment 仍不通過', () => {
  const result = summarize({
    reviews: [review('kent', 'APPROVED'), review('hank', 'CHANGES_REQUESTED'), review('hank', 'COMMENTED')],
  })
  assert.deepEqual(result, { reviewersCount: 2, approvedCount: 1, allApproved: false })
})

test('被 dismiss 的 Approve 不算通過', () => {
  const result = summarize({
    reviews: [review('kent', 'APPROVED'), review('kent', 'DISMISSED')],
  })
  assert.deepEqual(result, { reviewersCount: 1, approvedCount: 0, allApproved: false })
})

test('PR 作者回覆 review 不算 reviewer', () => {
  const result = summarize({
    reviews: [review('kent', 'APPROVED'), review('author', 'COMMENTED')],
  })
  assert.deepEqual(result, { reviewersCount: 1, approvedCount: 1, allApproved: true })
})

test('重新要求 review 的人不重複計算，且之前的 Approve 不算數', () => {
  const result = summarize({
    reviews: [review('kent', 'APPROVED'), review('hank', 'APPROVED')],
    requestedReviewers: ['kent'],
  })
  assert.deepEqual(result, { reviewersCount: 2, approvedCount: 1, allApproved: false })
})

test('還沒審核的人與 team 都要算進去', () => {
  const result = summarize({
    reviews: [review('kent', 'APPROVED')],
    requestedReviewers: ['hank'],
    requestedTeams: ['frontend'],
  })
  assert.deepEqual(result, { reviewersCount: 3, approvedCount: 1, allApproved: false })
})

test('沒有任何 reviewer 不算通過', () => {
  assert.deepEqual(summarize({}), { reviewersCount: 0, approvedCount: 0, allApproved: false })
})
