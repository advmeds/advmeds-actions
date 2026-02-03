# advmeds-actions

Monorepo for custom GitHub Actions

## Actions

- [pr-review-stats](./actions/pr-review-stats) - 取得 PR 的 Reviewer 數量與審核狀態

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
