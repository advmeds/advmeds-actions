const core = require("@actions/core");
const github = require("@actions/github");

async function run() {
  try {
    // 取得 Workflow 中傳入的 token (需要 repo 權限)
    const token = core.getInput("github-token", { required: true });
    const octokit = github.getOctokit(token);
    const context = github.context;

    if (!context.payload.pull_request) {
      core.setFailed("這個 Action 只能在 pull_request 事件下執行");
      return;
    }

    const prNumber = context.payload.pull_request.number;
    const owner = context.repo.owner;
    const repo = context.repo.repo;

    // 1. 取得 PR 詳細資訊 (包含 "已經被要求但尚未審核" 的人)
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    // 2. 取得所有的 Reviews 記錄
    const { data: reviews } = await octokit.rest.pulls.listReviews({
      owner,
      repo,
      pull_number: prNumber,
    });

    // 處理邏輯：
    // 一個人可能重複提交多次 Review，我們只看最後一次
    const latestReviews = {};
    reviews.forEach((review) => {
      latestReviews[review.user.login] = review.state;
    });

    const approvedUsers = Object.values(latestReviews).filter(
      (state) => state === "APPROVED",
    );
    const changesRequested = Object.values(latestReviews).filter(
      (state) => state === "CHANGES_REQUESTED",
    );

    // 計算 Reviewers 數量：
    // 包含「已經審核過的人」+「被要求了但還沒審核的人」
    const requestedReviewersCount = pr.requested_reviewers.length;
    const uniqueReviewersWhoActed = Object.keys(latestReviews).length;
    const totalReviewersCount =
      requestedReviewersCount + uniqueReviewersWhoActed;

    const approvedCount = approvedUsers.length;

    // 判斷條件：
    // 1. 至少有一個人 Approved
    // 2. 全部被要求的人都已經 Approved (意即沒有人 Pending 且沒有人提出 Changes Requested)
    const isAllApproved =
      approvedCount > 0 &&
      requestedReviewersCount === 0 &&
      changesRequested.length === 0;

    // 輸出結果
    core.setOutput("reviewers-count", totalReviewersCount);
    core.setOutput("approved-count", approvedCount);
    core.setOutput("all-approved", isAllApproved);

    console.log(`總 Reviewers: ${totalReviewersCount}`);
    console.log(`Approved 人數: ${approvedCount}`);
    console.log(`是否全數通過: ${isAllApproved}`);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
