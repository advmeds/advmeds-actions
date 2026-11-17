const core = require("@actions/core");
const github = require("@actions/github");
const { summarizeReviews } = require("./review-stats");

async function run() {
  try {
    const token = core.getInput("github-token", { required: true });
    const octokit = github.getOctokit(token);
    const context = github.context;

    if (!context.payload.pull_request) {
      core.setFailed("這個 Action 只能在 pull_request 事件下執行");
      return;
    }

    const params = {
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.payload.pull_request.number,
    };

    const { data: pr } = await octokit.rest.pulls.get(params);
    const reviews = await octokit.paginate(octokit.rest.pulls.listReviews, {
      ...params,
      per_page: 100,
    });

    const { reviewersCount, approvedCount, allApproved } = summarizeReviews({
      author: pr.user.login,
      reviews,
      requestedReviewers: pr.requested_reviewers.map((user) => user.login),
      requestedTeams: pr.requested_teams.map((team) => team.slug),
    });

    core.setOutput("reviewers-count", reviewersCount);
    core.setOutput("approved-count", approvedCount);
    core.setOutput("all-approved", allApproved);

    console.log(`總 Reviewers: ${reviewersCount}`);
    console.log(`Approved 人數: ${approvedCount}`);
    console.log(`是否全數通過: ${allApproved}`);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
