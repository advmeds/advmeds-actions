import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parse } from 'yaml'

const execFileAsync = promisify(execFile)

const workflowPath = fileURLToPath(new URL('../.github/workflows/assign-reviewers.yml', import.meta.url))
const workflow = parse(readFileSync(workflowPath, 'utf8'))
const selectStep = workflow.jobs['assign-reviewers'].steps.find((step) => step.id === 'select')
assert.ok(selectStep?.run, 'assign-reviewers.yml must have a step with id "select" and a run block')

const workDir = mkdtempSync(join(tmpdir(), 'assign-reviewers-'))
const scriptPath = join(workDir, 'select.sh')
writeFileSync(scriptPath, selectStep.run)
after(() => rmSync(workDir, { recursive: true, force: true }))

const SHUFFLE_RUNS = 30
const TEAM = ['ann', 'bob', 'cat', 'dan', 'eve', 'fay', 'gus', 'hal']
const TIER_4 = { lines: 501, files: 1 }

let runId = 0

async function select({ team = TEAM, probation = [], senior = [], owners = [], author = 'author', lines, files }) {
  const outputPath = join(workDir, `output-${runId++}`)
  writeFileSync(outputPath, '')

  // 與 workflow 的 `shell: bash` 相同的旗標；timeout 用來抓出湊不滿人數時的無窮迴圈
  await execFileAsync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', scriptPath], {
    timeout: 30_000,
    env: {
      ...process.env,
      TEAM_MEMBERS: JSON.stringify(team),
      PASSED_PROBATION_MEMBERS: JSON.stringify(probation),
      SENIOR_MEMBERS: JSON.stringify(senior),
      CODE_OWNERS: JSON.stringify(owners),
      PR_AUTHOR: author,
      TOTAL_LINES: String(lines),
      CHANGED_FILES: String(files),
      GITHUB_OUTPUT: outputPath,
    },
  })

  const output = readFileSync(outputPath, 'utf8').match(/^reviewers=(.*)$/m)
  assert.ok(output, 'the select step must write reviewers=<json array> to GITHUB_OUTPUT')
  return JSON.parse(output[1])
}

function selectRepeatedly(fixture, runs = SHUFFLE_RUNS) {
  return Promise.all(Array.from({ length: runs }, () => select(fixture)))
}

function assertNoDuplicates(selected) {
  assert.equal(new Set(selected).size, selected.length, `no reviewer may be selected twice, got ${selected}`)
}

test('the PR author is never selected', async () => {
  // 最高級距要 4 人、扣掉作者剛好剩 3 人：只要沒排除作者，作者每次都會入選
  const fixture = { team: ['ann', 'bob', 'cat', 'Author'], author: 'author', ...TIER_4 }
  for (const selected of await selectRepeatedly(fixture)) {
    assert.deepEqual([...selected].sort(), ['ann', 'bob', 'cat'], 'the PR author must never be selected')
  }
})

test('a code owner is never selected', async () => {
  const fixture = { team: ['ann', 'bob', 'cat', 'KentRyuu'], owners: ['kentryuu'], ...TIER_4 }
  for (const selected of await selectRepeatedly(fixture)) {
    assert.deepEqual([...selected].sort(), ['ann', 'bob', 'cat'], 'a code owner must never be selected')
  }
})

test('reviewer count follows the tiers of changed lines and changed files', async () => {
  const tiers = [
    { lines: 0, files: 0, count: 1 },
    { lines: 50, files: 3, count: 1 },
    { lines: 51, files: 3, count: 2 },
    { lines: 50, files: 4, count: 2 },
    { lines: 200, files: 10, count: 2 },
    { lines: 201, files: 10, count: 3 },
    { lines: 200, files: 11, count: 3 },
    { lines: 500, files: 999, count: 3 },
    { lines: 501, files: 1, count: 4 },
  ]
  for (const { lines, files, count } of tiers) {
    for (const selected of await selectRepeatedly({ lines, files }, 3)) {
      assert.equal(selected.length, count, `${lines} lines / ${files} files must select ${count} reviewer(s)`)
      assertNoDuplicates(selected)
    }
  }
})

test('reviewer count is capped at the number of available reviewers', async () => {
  const fixture = { team: ['ann', 'bob', 'author'], ...TIER_4 }
  for (const selected of await selectRepeatedly(fixture, 5)) {
    assert.deepEqual([...selected].sort(), ['ann', 'bob'], 'count must be capped at the available reviewers')
  }
})

test('count >= 2 always includes a passed-probation member when one is available', async () => {
  for (const tier of [{ lines: 51, files: 1 }, { lines: 201, files: 1 }, TIER_4]) {
    for (const selected of await selectRepeatedly({ probation: ['hal'], ...tier })) {
      assert.ok(selected.includes('hal'), `count >= 2 must include a passed-probation member, got ${selected}`)
    }
  }
})

test('count >= 3 always includes a senior member when one is available', async () => {
  for (const tier of [{ lines: 201, files: 1 }, TIER_4]) {
    for (const selected of await selectRepeatedly({ probation: ['ann'], senior: ['hal'], ...tier })) {
      assert.ok(selected.includes('hal'), `count >= 3 must include a senior member, got ${selected}`)
    }
  }
})

test('guaranteed seats fall back to the shuffle when nobody qualifies', async () => {
  // 唯一符合資格的人是作者，名額仍要湊滿
  const fixture = { team: [...TEAM, 'author'], probation: ['author'], senior: ['author'], ...TIER_4 }
  for (const selected of await selectRepeatedly(fixture, 5)) {
    assert.equal(selected.length, 4, 'seats must still be filled when no qualified member is available')
    assert.ok(!selected.includes('author'), 'the PR author must never be selected')
  }
})

test('no reviewer is selected twice', async () => {
  // 同一人同時是通過試用期與資深成員，兩個保障名額不能重複算到他
  const fixture = { team: ['ann', 'bob', 'cat', 'dan'], probation: ['ann'], senior: ['ann', 'bob'], ...TIER_4 }
  for (const selected of await selectRepeatedly(fixture)) {
    assertNoDuplicates(selected)
    assert.deepEqual([...selected].sort(), ['ann', 'bob', 'cat', 'dan'], 'all four seats must be filled with distinct reviewers')
  }
})

test('zero available reviewers produces an empty selection without hanging', async () => {
  for (const team of [[], ['author'], ['author', 'owner']]) {
    const selected = await select({ team, owners: ['owner'], ...TIER_4 })
    assert.deepEqual(selected, [], `team ${JSON.stringify(team)} must produce an empty selection`)
  }
})
