import { loadCliConfig } from '../config/config.js';
import { loadSettings, SettingScope } from '../config/settings.js';
import { loadExtensions } from '../config/extension.js';
import { cleanupCheckpoints } from '../utils/cleanup.js';
import {
  Config,
  sessionId,
  AuthType,
  GeminiEventType,
  GeminiClient,
  ToolCallRequestInfo,
  CoreToolScheduler,
  ApprovalMode,
  closeAllMCPConnections
} from '@google/gemini-cli-core';
import { type Part } from '@google/genai';
import { AgentConfig, AgentResult } from './types.js';
import { logStream, processStreamEvent } from './util.js';

export class ElcAgent {
  results: AgentResult[] = [];
  abortController = new AbortController();
  showLog: boolean = false;
  rootPath?: string;
  extension?: any;
  disableReadArgs: boolean = false;

  constructor(agentConfig: AgentConfig) {
    const {
      authType,
      model,
      endpoint,
      provider,
      apiKey,
      temperature,
      topP,
      maxTokens,
      readonly,
      log,
      rootPath,
      extension,
      systemPrompt,
      disableReadArgs
    } = agentConfig;
    this.showLog = log || false;
    this.extension = extension;
    this.disableReadArgs = disableReadArgs || false;
    if (!authType || authType === AuthType.CUSTOM_LLM_API) {
      process.env.USE_CUSTOM_LLM = 'true';
      if (!model || !apiKey || !endpoint) {
        throw new Error(
          'AgentConfig must include a model, apiKey and endpoint',
        );
      }
      process.env.CUSTOM_LLM_MODEL_NAME = model;
      process.env.CUSTOM_LLM_ENDPOINT = endpoint;
      process.env.CUSTOM_LLM_API_KEY = apiKey;
      process.env.CUSTOM_LLM_PROVIDER = provider;
      process.env.CUSTOM_LLM_TEMPERATURE = String(temperature || 0);
      process.env.CUSTOM_LLM_TOP_P = String(topP || 1);
      process.env.CUSTOM_LLM_MAX_TOKENS = String(maxTokens || 8096);
    }
    if (readonly) {
      process.env.READ_ONLY = 'true';
    }
    if (rootPath) {
      this.rootPath = rootPath;
      try {
        process.chdir(rootPath);
      } catch {
        // ignore chdir error in worker
      }
    }
    if (systemPrompt) {
      process.env.SYSTEM_PROMPT = systemPrompt;
    }
  }

  async run(userInput: string): Promise<string> {
    const workspaceRoot = process.cwd();
    const settings = loadSettings(process.cwd());
    await cleanupCheckpoints();
    const extensions: any = this.extension
      ? [{ config: this.extension }]
      : loadExtensions(workspaceRoot);
    const config = await loadCliConfig(settings.merged, extensions, sessionId, this.disableReadArgs);

    settings.setValue(
      SettingScope.User,
      'selectedAuthType',
      process.env.USE_CUSTOM_LLM
        ? AuthType.CUSTOM_LLM_API
        : AuthType.LOGIN_WITH_GOOGLE,
    );

    await config.initialize();
    const selectedAuthType =
      settings.merged.selectedAuthType || AuthType.CUSTOM_LLM_API;
    await config.refreshAuth(selectedAuthType);

    const geminiClient = config.getGeminiClient();
    await this.processConversationRound(config, geminiClient, [
      { text: userInput },
    ]);
    //close mcp connection
    await closeAllMCPConnections();
    return this.getLastResult();
  }

  async processConversationRound(
    config: Config,
    geminiClient: GeminiClient,
    messageParts: Part[],
  ): Promise<void> {
    const stream = geminiClient.sendMessageStream(
      messageParts,
      this.abortController.signal,
    );

    const toolCallRequests: ToolCallRequestInfo[] = [];

    for await (const event of stream) {
      const result = processStreamEvent(event);
      if (result) {
        this.showLog && logStream(result);
        this.results.push(result);
      }
      if (event.type === GeminiEventType.ToolCallRequest) {
        toolCallRequests.push(event.value);
      }
    }

    if (toolCallRequests.length > 0) {
      const responseParts = await this.executeToolCalls(
        config,
        toolCallRequests,
      );

      if (responseParts.length > 0) {
        await this.processConversationRound(
          config,
          geminiClient,
          responseParts,
        );
      }
    }
  }

  async executeToolCalls(
    config: Config,
    toolCallRequests: ToolCallRequestInfo[],
  ): Promise<Part[]> {
    return new Promise((resolve, reject) => {
      const responseParts: Part[] = [];

      const scheduler = new CoreToolScheduler({
        toolRegistry: config.getToolRegistry(),
        approvalMode: ApprovalMode.YOLO,
        getPreferredEditor: () => undefined,
        config,
        onAllToolCallsComplete: (completedToolCalls) => {
          for (const toolCall of completedToolCalls) {
            this.showLog &&
              console.log(
                '=== excute tool ===',
                toolCall.request.name,
                toolCall.status,
              );
            this.showLog && console.log('');
            if (toolCall.status === 'success') {
              // 添加成功的工具响应
              const responsePartsArray = Array.isArray(
                toolCall.response.responseParts,
              )
                ? toolCall.response.responseParts
                : [toolCall.response.responseParts];
              responseParts.push(
                ...responsePartsArray.map((part) =>
                  typeof part === 'string' ? { text: part } : part,
                ),
              );

              // 将工具执行结果添加到结果中
              this.results.push({
                type: 'tool_call',
                toolCall: {
                  name: toolCall.request.name,
                  args: toolCall.request.args || {},
                  result: {
                    llmContent: toolCall.response.responseParts,
                    returnDisplay: toolCall.response.resultDisplay,
                  },
                },
                timestamp: Date.now(),
              });
            } else if (toolCall.status === 'error') {
              // 添加错误响应
              const responsePartsArray = Array.isArray(
                toolCall.response.responseParts,
              )
                ? toolCall.response.responseParts
                : [toolCall.response.responseParts];
              responseParts.push(
                ...responsePartsArray.map((part) =>
                  typeof part === 'string' ? { text: part } : part,
                ),
              );

              this.results.push({
                type: 'error',
                error: `Tool '${toolCall.request.name}' failed: ${toolCall.response.error?.message || 'Unknown error'}`,
                timestamp: Date.now(),
              });
            } else if (toolCall.status === 'cancelled') {
              // 添加取消响应
              const responsePartsArray = Array.isArray(
                toolCall.response.responseParts,
              )
                ? toolCall.response.responseParts
                : [toolCall.response.responseParts];
              responseParts.push(
                ...responsePartsArray.map((part) =>
                  typeof part === 'string' ? { text: part } : part,
                ),
              );

              this.results.push({
                type: 'error',
                error: `Tool '${toolCall.request.name}' was cancelled`,
                timestamp: Date.now(),
              });
            }
          }

          resolve(responseParts);
        },
      });

      scheduler
        .schedule(toolCallRequests, this.abortController.signal)
        .catch((error) => {
          reject(error);
        });
    });
  }

  getAllResults(): any {
    const result = [];
    for (let i = 0; i < this.results.length; i++) {
      const { type, content } = this.results[i];
      if (type === 'content') {
        const latestIndex: number = result.length === 0 ? 0 : result.length - 1;
        if (typeof result[latestIndex] === 'string') {
          result[latestIndex] += content;
        } else {
          result[latestIndex] = content;
        }
      } else {
        result.push(this.results[i]);
      }
    }
    return result;
  }

  getLastResult(): string {
    const reverse = [...this.results].reverse();
    const texts = [];
    for (let i = 0; i < reverse.length; i++) {
      const { type, content } = reverse[i];
      if (type === 'content') {
        texts.push(content);
      } else {
        break;
      }
    }
    return texts.reverse().join('');
  }
}
