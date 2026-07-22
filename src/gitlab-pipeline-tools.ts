import { assertGitLabBaseUrlAllowed } from './gitlab-origin.js';
import { checkGitLabPipelineTarget } from './gitlab-pipelines.js';
import {
  getGitLabPipelineTarget,
  listGitLabPipelineTargets,
  recordGitLabPipelineCheck,
  registerGitLabPipelineTarget,
  unregisterGitLabPipelineTarget
} from './gitlab-pipeline-registry.js';
import { toolError } from './tool-errors.js';
import {
  CheckGitLabPipelineSchema,
  ListGitLabPipelinesSchema,
  RegisterGitLabPipelineSchema,
  UnregisterGitLabPipelineSchema
} from './types.js';
import type {
  CheckGitLabPipelineInput,
  ListGitLabPipelinesInput,
  RegisterGitLabPipelineInput,
  UnregisterGitLabPipelineInput
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
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }]
  };
}

export function registerGitLabPipelineTools(server: ToolRegistrar): void {
  server.registerTool(
    'register_gitlab_pipeline',
    {
      title: 'Register GitLab Pipeline',
      description:
        'Register a GitLab CI/CD project pipeline. GitLab.com is allowed by default; self-hosted HTTPS origins require HEALTH_MONITOR_GITLAB_BASE_URL_ALLOWLIST. Only the token environment-variable name is stored.',
      inputSchema: RegisterGitLabPipelineSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async (input: RegisterGitLabPipelineInput) => {
      let baseUrl: string;
      try {
        baseUrl = assertGitLabBaseUrlAllowed(input.base_url);
      } catch (error) {
        return formatResponse(
          toolError(
            'GITLAB_BASE_URL_NOT_ALLOWED',
            error instanceof Error ? error.message : 'GitLab base URL is not allowed',
            'Use https://gitlab.com or add the exact self-hosted HTTPS origin to HEALTH_MONITOR_GITLAB_BASE_URL_ALLOWLIST.'
          )
        );
      }

      const result = registerGitLabPipelineTarget({ ...input, base_url: baseUrl });
      return formatResponse({
        ...result,
        message: `${input.name} registered. Run check_gitlab_pipeline to inspect the latest pipeline.`
      });
    }
  );

  server.registerTool(
    'check_gitlab_pipeline',
    {
      title: 'Check GitLab Pipeline',
      description:
        'Check the latest registered GitLab pipeline and return failed job, stage, ref, commit, URL, and bounded trace diagnostics.',
      inputSchema: CheckGitLabPipelineSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    async (input: CheckGitLabPipelineInput) => {
      const target = getGitLabPipelineTarget(input.name);
      if (!target) {
        return formatResponse(
          toolError(
            'GITLAB_PIPELINE_TARGET_NOT_FOUND',
            `GitLab pipeline target is not registered: ${input.name}`,
            'Run register_gitlab_pipeline first, then retry the operation.'
          )
        );
      }

      const result = await checkGitLabPipelineTarget(target, input.timeout_ms);
      recordGitLabPipelineCheck(target.name, result);

      return formatResponse({
        name: target.name,
        base_url: target.base_url,
        project: target.project,
        ref: target.ref,
        ...result,
        checked_at: new Date().toISOString(),
        message:
          result.status === 'up'
            ? `${target.name} is UP - latest pipeline state ${result.pipeline?.status ?? 'unknown'}`
            : `${target.name} is ${result.status.toUpperCase()} - ${result.error_message ?? result.pipeline?.status ?? 'pipeline failure'}`
      });
    }
  );

  server.registerTool(
    'list_gitlab_pipelines',
    {
      title: 'List GitLab Pipelines',
      description: 'List registered GitLab pipeline targets and their latest status.',
      inputSchema: ListGitLabPipelinesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    async (input: ListGitLabPipelinesInput) => {
      const targets = listGitLabPipelineTargets(input);
      return formatResponse({ count: targets.length, targets });
    }
  );

  server.registerTool(
    'unregister_gitlab_pipeline',
    {
      title: 'Unregister GitLab Pipeline',
      description: 'Remove a GitLab pipeline target and its stored check history.',
      inputSchema: UnregisterGitLabPipelineSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false
      }
    },
    async (input: UnregisterGitLabPipelineInput) =>
      formatResponse(unregisterGitLabPipelineTarget(input.name))
  );
}
