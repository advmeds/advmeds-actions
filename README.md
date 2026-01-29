# How to use in Workflow

```yml
on:
  pull_request_review:
    types: [submitted, dismissed]
  pull_request:
    types: [review_requested]

jobs:
  check-status:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Get PR Stats
        id: pr-stats
        uses: ./ 
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Do something if all approved
        if: steps.pr-stats.outputs.all-approved == 'true'
        run: echo "🎉 所有人皆已同意，可以合併囉！"

run: echo "🎉 Everyone has agreed, we can merge now!"
```
