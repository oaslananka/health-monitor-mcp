import { checkGitHubActionsTarget } from './github-actions.js';
import {
  getGitHubActionsTarget,
  listGitHubActionsTargets,
  recordGitHubActionsCheck,
  registerGitHubActionsTarget,
  unregisterGitHubActionsTarget
} from './github-actions-registry.js';
import { toolError } from './tool-errors.js';
import {
  CheckGitHubActionsSchema,
  ListGitHubActionsSchema,
  RegisterGitHubActionsSchema,
  UnregisterGitHubActionsSchema
} from './types.js';
import type {
  CheckGitHubActionsInput,
  ListGitHubActionsInput,
  RegisterGitHubActionsInput,
  UnregisterGitHubActionsInput
} from './types.js';

type ToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
};

type ToolRegistrar = {
  registerTool: (
    name: string,
    config: {
      title?: string;
      description?: string;
      inputSchema?: object;
      annotations?: {
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        openWorldHint?: boolean;
      };
    },
    handler: unknown
  ) => unknown;
};

function formatResponse(payload: unknown): ToolResponse {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

export function registerGitHubActionsTools(server: ToolRegistrar): void {
  server.registerTool(
    'register_github_actions',
    {
      title: 'Register GitHub Actions Workflow',
      description:
        'Register a GitHub Actions workflow by owner, repository, and workflow file or ID. Only the token environment-variable name is stored; token values remain in the runtime environment.',
      inputSchema: RegisterGitHubActionsSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async (input: RegisterGitHubActionsInput) => {
      const result = registerGitHubActionsTarget(input);
      return formatResponse({
        ...result,
        message: `${input.name} registered. Run check_github_actions to inspect the latest workflow run.`
      });
    }
  );

  server.registerTool(
    'check_github_actions',
    {
      title: 'Check GitHub Actions Workflow',
      description:
        'Check the latest run for a registered GitHub Actions workflow and return failed job and step diagnostics.',
      inputSchema: CheckGitHubActionsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    async (input: CheckGitHubActionsInput) => {
      const target = getGitHubActionsTarget(input.name);
      if (!target) {
        return formatResponse(
          toolError(
            'GITHUB_ACTIONS_TARGET_NOT_FOUND',
            `GitHub Actions target is not registered: ${input.name}`,
            'Run register_github_actions first, then retry the operation.'
          )
        );
      }

      const result = await checkGitHubActionsTarget(target, input.timeout_ms);
      recordGitHubActionsCheck(target.name, result);

      return formatResponse({
        name: target.name,
        owner: target.owner,
        repository: target.repository,
        workflow: target.workflow,
        branch: target.branch,
        ...result,
        checked_at: new Date().toISOString(),
        message:
          result.status === 'up'
            ? `${target.name} is UP - latest workflow state ${result.run?.conclusion ?? result.run?.status ?? 'unknown'}`
            : `${target.name} is ${result.status.toUpperCase()} - ${result.error_message ?? result.run?.conclusion ?? 'workflow failure'}`
      });
    }
  );

  server.registerTool(
    'list_github_actions',
    {
      title: 'List GitHub Actions Workflows',
      description: 'List registered GitHub Actions workflow targets and their latest status.',
      inputSchema: ListGitHubActionsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async (input: ListGitHubActionsInput) => {
      const targets = listGitHubActionsTargets(input);
      return formatResponse({ count: targets.length, targets });
    }
  );

  server.registerTool(
    'unregister_github_actions',
    {
      title: 'Unregister GitHub Actions Workflow',
      description: 'Remove a GitHub Actions workflow target and its stored check history.',
      inputSchema: UnregisterGitHubActionsSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false
      }
    },
    async (input: UnregisterGitHubActionsInput) =>
      formatResponse(unregisterGitHubActionsTarget(input.name))
  );
}
