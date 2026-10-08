# advmeds-actions

Monorepo for custom GitHub Actions

## Actions

- [pr-review-stats](./actions/pr-review-stats) - 取得 PR 的 Reviewer 數量與審核狀態

## Reusable Workflows

前端 repo 共用的 CI 流程，以 `workflow_call` 提供。各 repo 只要把 [`callers/`](./callers) 裡對應的檔案複製到自己的 `.github/workflows/` 即可，檔名照 `callers/` 內的命名。

| Workflow | Caller 範本 | 用途 |
| --- | --- | --- |
| [`fe-lint-test.yml`](./.github/workflows/fe-lint-test.yml) | [`callers/lint-test.yml`](./callers/lint-test.yml) | PR 全員 approve 或貼上 `run-tests` label 後，跑 lint、type check 與測試 |
| [`assign-reviewers.yml`](./.github/workflows/assign-reviewers.yml) | [`callers/assign-reviewers.yml`](./callers/assign-reviewers.yml) | 依 PR 大小從 team 成員中挑選並指派 reviewer |
| [`release-please.yml`](./.github/workflows/release-please.yml) | [`callers/release-please.yml`](./callers/release-please.yml) | 執行 release-please |

### 共通需求

- Organization secret `PERSONAL_ACCESS_TOKEN`：caller 以 `secrets: inherit` 傳入。
- 版本：caller 一律 pin `@v1`，例如 `uses: advmeds/advmeds-actions/.github/workflows/fe-lint-test.yml@v1`。
- 權限：被呼叫的 workflow 拿不到比 caller 更多的權限，所以 caller 範本裡的 `permissions:` 不要刪。

### fe-lint-test

沒有 inputs，要跑哪些檢查完全由 repo 自己的 `package.json` 與 `node_modules/.bin` 決定。每次執行的 job summary 會列出每項檢查是 passed、failed 還是 skipped（含跳過原因）。

`package.json` 慣例：

| 項目 | 用途 |
| --- | --- |
| `engines.node` | Node 版本（`actions/setup-node` 的 `node-version-file: package.json`） |
| `packageManager` | pnpm 版本（`pnpm/action-setup`），例如 `pnpm@9.15.6` |
| `scripts.type-check` | 有這個 script 且有 JS／TS／Vue 檔變更時執行 |
| `scripts.test:unit` | 有這個 script 就執行 |
| `scripts.ci:extra` | 有這個 script 就執行；repo 專屬的檢查（Vite build、NX lint 等）放這裡 |

Lint 工具只檢查 PR 相對於 base branch 有變更的檔案，而且只有在 `node_modules/.bin` 找得到該工具時才執行：

| Binary | 檢查的副檔名 |
| --- | --- |
| `eslint` | `vue` `js` `jsx` `cjs` `mjs` `ts` `tsx` `cts` `mts` |
| `prettier`（`--check`） | 同上 |
| `stylelint` | `vue` `css` `scss` `sass` `less` |

Labels：

- `run-tests`：貼上後不等 approve 直接執行；每次執行結束都會移除。
- `✅state: waiting update`：所有檢查通過後加上。

### assign-reviewers

| Input | 預設值 | 說明 |
| --- | --- | --- |
| `team` | `f2e` | 可被指派為 reviewer 的 team slug |
| `passed-probation-team` | `f2e_passed_probation` | 已通過試用期成員的 team slug |
| `senior-team` | `f2e_senior` | 資深成員的 team slug |
| `exclude-paths` | `*/swaggerTypescriptApi/**`、`*/mCoreUI/**` | 計算變更行數時排除的路徑，一行一個 git pathspec glob |
| `dry-run` | `false` | 只在 log 印出挑選結果，不實際指派 |

Organization 取自呼叫端 repo 的 owner。PR 作者與 `CODEOWNERS` 中符合變更檔案的個人帳號不會被選到。

人數依變更行數與檔案數決定，且不會超過可指派的人數：

| 變更行數 | 變更檔案數 | Reviewer 人數 |
| --- | --- | --- |
| ≤ 50 | ≤ 3 | 1 |
| ≤ 200 | ≤ 10 | 2 |
| ≤ 500 | 不限 | 3 |
| 其他 | | 4 |

2 人以上時至少包含一位已通過試用期的成員，3 人以上時至少再包含一位資深成員，其餘名額隨機挑選。

覆寫 input 的寫法：

```yaml
jobs:
  assign-reviewers:
    permissions:
      contents: read
    uses: advmeds/advmeds-actions/.github/workflows/assign-reviewers.yml@v1
    with:
      team: backend
      exclude-paths: |
        */generated/**
        docs/**
    secrets: inherit
```

### release-please

| Input | 必填 | 說明 |
| --- | --- | --- |
| `target-branch` | 是 | release-please 要追蹤並開 release PR 的分支 |

設定檔路徑固定為 `.github/release-please-config.json` 與 `.github/.release-please-manifest.json`。

## Development

This project uses pnpm workspaces for monorepo management.

### Setup

```bash
pnpm install
```

### Build

```bash
# Build all actions
pnpm build

# Build specific action
cd actions/pr-review-stats
pnpm build
```

### Test

```bash
pnpm test
```

測試會從 `assign-reviewers.yml` 取出挑選 reviewer 的 `run:` 區塊直接執行，本機需要有 `bash`、`jq` 與 `shuf`（Windows 請在 Git Bash 下執行）。
