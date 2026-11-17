// GitHub 的審核狀態規則：COMMENTED 不會蓋掉之前的 APPROVED / CHANGES_REQUESTED，
// DISMISSED 則會讓那個人回到「沒有表態」。
const DECISIVE_STATES = new Set(["APPROVED", "CHANGES_REQUESTED", "DISMISSED"]);

function summarizeReviews({ author, reviews, requestedReviewers, requestedTeams }) {
  const stateByUser = new Map();
  for (const review of reviews) {
    const login = review.user?.login;
    // PR 作者回覆 review thread 也會產生 COMMENTED review，不算 reviewer
    if (!login || login === author) continue;
    if (DECISIVE_STATES.has(review.state) || !stateByUser.has(login)) {
      stateByUser.set(login, review.state);
    }
  }

  // 被重新要求 review 的人，之前的 Approve 不算數
  for (const login of requestedReviewers) {
    stateByUser.set(login, "PENDING");
  }

  const reviewersCount = stateByUser.size + requestedTeams.length;
  const approvedCount = [...stateByUser.values()].filter(
    (state) => state === "APPROVED",
  ).length;

  return {
    reviewersCount,
    approvedCount,
    allApproved: approvedCount > 0 && approvedCount === reviewersCount,
  };
}

module.exports = { summarizeReviews };
