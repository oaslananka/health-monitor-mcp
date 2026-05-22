import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const actionablePattern =
  /(Bug:|Potential issue:|Suggested Fix|security|vulnerability|correctness|release|publish|workflow|secret|token|unsafe|package|registry|auth|permission|artifact|attestation|mirror|tag|branch|MCP|stdio|HTTP|OAuth|JWKS|bearer|credential|command injection)/i;

function writeSummary(payload) {
  fs.writeFileSync('review-thread-summary.json', JSON.stringify(payload, null, 2));
}

function resolveCommand(command) {
  if (process.platform === 'win32' && command === 'gh') {
    return 'gh.exe';
  }

  return command;
}

function runGhGraphql(query, variables) {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    args.push('-F', `${key}=${value}`);
  }

  const result = spawnSync(resolveCommand('gh'), args, { encoding: 'utf8' });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'gh graphql request failed');
  }

  return JSON.parse(result.stdout);
}

const repository = process.env.GITHUB_REPOSITORY;
const prNumber = process.env.PR_NUMBER || process.env.GITHUB_EVENT_PULL_REQUEST_NUMBER;

if (!repository || !prNumber) {
  const payload = {
    ok: true,
    skipped: true,
    reason: 'not running in a pull_request context'
  };
  writeSummary(payload);
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const [owner, name] = repository.split('/');
const query = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id
      url
      isDraft
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          originalLine
          diffSide
          comments(first: 20) {
            nodes {
              author { login }
              body
              url
              createdAt
              updatedAt
            }
          }
        }
      }
    }
  }
}`;

const response = runGhGraphql(query, {
  owner,
  name,
  number: Number(prNumber)
});
const pullRequest = response.repository.pullRequest;
const unresolved = pullRequest.reviewThreads.nodes.filter((thread) => {
  if (thread.isResolved || thread.isOutdated) {
    return false;
  }

  return thread.comments.nodes.some((comment) => actionablePattern.test(comment.body));
});
const payload = {
  ok: unresolved.length === 0,
  pull_request: {
    id: pullRequest.id,
    url: pullRequest.url,
    isDraft: pullRequest.isDraft
  },
  unresolved_actionable_threads: unresolved
};

writeSummary(payload);
console.log(JSON.stringify(payload, null, 2));

if (unresolved.length > 0) {
  process.exit(1);
}
