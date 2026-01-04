/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentResponse,
  Part,
  GenerateContentParameters,
} from '@google/genai';
import {
  normalizeContents,
  isValidFunctionCall,
  isValidFunctionResponse,
} from './util.js';
import OpenAI from 'openai';
import { ToolCallMap } from './types.js';

export class ModelConverter {
  /**
   * Convert Gemini content to OpenAI messages
   */
  static toOpenAIMessages(
    request: GenerateContentParameters,
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const { contents, config } = request;
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: (config?.systemInstruction as string) || '',
      },
    ];
    const contentsArray = normalizeContents(contents);
    for (const content of contentsArray) {
      const role =
        content.role === 'model' ? 'assistant' : (content.role as string);
      const parts = content.parts || [];
      this.processTextParts(parts, role, messages);
      this.processFunctionResponseParts(parts, messages);
      this.processFunctionCallParts(parts, messages);
    }
    return messages;
  }

  /**
   * Convert text parts to OpenAI messages
   */
  private static processTextParts(
    parts: Part[],
    role: string,
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  ): void {
    const textParts = parts.filter(
      (part): part is { text: string } =>
        typeof part === 'object' && part !== null && 'text' in part,
    );
    if (textParts.length > 0) {
      const text = textParts.map((part) => part.text).join('\n');
      if (role === 'user') {
        messages.push({
          role: 'user',
          content: text,
        });
      } else if (role === 'system') {
        messages.push({
          role: 'system',
          content: text,
        });
      } else if (role === 'assistant') {
        messages.push({
          role: 'assistant',
          content: text,
        });
      }
    }
  }

  /**
   * Convert function response parts to OpenAI messages
   */
  private static processFunctionResponseParts(
    parts: Part[],
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  ): void {
    const frParts = parts.filter(isValidFunctionResponse);
    if (frParts.length > 0) {
      for (const part of frParts) {
        messages.push({
          tool_call_id: part.functionResponse.id,
          role: 'tool',
          content: part.functionResponse.response.error
            ? `Error: ${part.functionResponse.response.error}`
            : part.functionResponse.response.output || '',
        });
      }
      this.processImageParts(parts, messages);
    }
  }

  /**
   * Convert image parts to OpenAI messages
   */
  private static processImageParts(
    parts: Part[],
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  ): void {
    const imgParts = parts.filter((part) => part.inlineData);
    if (imgParts.length > 0) {
      const { inlineData = '' } = imgParts[0];
      if (
        inlineData &&
        inlineData.mimeType?.startsWith('image/') &&
        inlineData.data
      ) {
        messages.push({
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url:
                  'data:' + inlineData.mimeType + ';base64,' + inlineData.data,
              },
            },
          ],
        });
      }
    }
  }

  /**
   * Convert function call parts to OpenAI messages
   */
  private static processFunctionCallParts(
    parts: Part[],
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  ): void {
    const fcParts = parts.filter(isValidFunctionCall);
    if (fcParts.length > 0) {
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: fcParts.map((part: any) => ({
          id: part.functionCall.id,
          type: 'function',
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args),
          },
        })),
      });
    }
  }

  /**
   * Convert OpenAI response to Gemini response
   */
  static toGeminiResponse(
    response: OpenAI.Chat.Completions.ChatCompletion,
  ): GenerateContentResponse {
    const choice = response.choices[0];
    const res = new GenerateContentResponse();

    const message = (choice.message || {}) as any;

    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      res.candidates = [
        {
          content: {
            parts: message.tool_calls.map((toolCall: any) => {
              let args: Record<string, unknown> = {};
              const rawArgs = toolCall?.function?.arguments;
              if (typeof rawArgs === 'string' && rawArgs.trim().length > 0) {
                try {
                  args = JSON.parse(rawArgs);
                } catch {
                  args = {};
                }
              }
              const id =
                typeof toolCall?.id === 'string' && toolCall.id.trim().length > 0
                  ? toolCall.id
                  : `call_${Math.random().toString(36).slice(2)}`;
              return {
                functionCall: {
                  id,
                  name: toolCall.function.name,
                  args,
                },
              };
            }),
            role: 'model',
          },
          index: 0,
          safetyRatings: [],
        },
      ];
    } else {
      const content = message.content;
      const refusal = message.refusal;
      const reasoningContent = message.reasoning_content;

      let text: string | undefined;
      if (typeof content === 'string' && content.trim().length > 0) {
        text = content;
      } else if (Array.isArray(content)) {
        const segments = content
          .map((part: any) => {
            if (typeof part === 'string') {
              return part;
            }
            if (typeof part === 'object' && part !== null && 'text' in part) {
              return typeof part.text === 'string' ? part.text : '';
            }
            return '';
          })
          .filter(Boolean);
        if (segments.length > 0) {
          text = segments.join('');
        }
      } else if (typeof content === 'object' && content !== null) {
        if (
          'text' in content &&
          typeof content.text === 'string' &&
          content.text.trim().length > 0
        ) {
          text = content.text;
        } else {
          try {
            text = JSON.stringify(content);
          } catch {
            text = String(content);
          }
        }
      }

      if (typeof text !== 'string' || text.trim().length === 0) {
        if (typeof refusal === 'string' && refusal.trim().length > 0) {
          text = refusal;
        } else if (
          typeof reasoningContent === 'string' &&
          reasoningContent.trim().length > 0
        ) {
          text = reasoningContent;
        } else if (typeof content === 'string') {
          text = content;
        }
      }

      if (typeof text === 'string') {
        res.candidates = [
          {
            content: {
              parts: [{ text }],
              role: 'model',
            },
            index: 0,
            safetyRatings: [],
          },
        ];
      }
    }
    res.usageMetadata = {
      promptTokenCount: response.usage?.prompt_tokens || 0,
      candidatesTokenCount: response.usage?.completion_tokens || 0,
      totalTokenCount: response.usage?.total_tokens || 0,
    };

    return res;
  }

  /**
   * Convert OpenAI streaming text content to Gemini response
   */
  static toGeminiStreamTextResponse(content: string): GenerateContentResponse {
    const res = new GenerateContentResponse();
    res.candidates = [
      {
        content: {
          parts: [{ text: content }],
          role: 'model',
        },
        index: 0,
        safetyRatings: [],
      },
    ];
    return res;
  }

  /**
   * Convert completed tool calls to Gemini response
   */
  static toGeminiStreamToolCallsResponse(
    toolCallMap: ToolCallMap,
  ): GenerateContentResponse {
    const res = new GenerateContentResponse();
    res.candidates = [
      {
        content: {
          parts: Array.from(toolCallMap.entries()).map(
            ([_index, toolCall]) => {
              let args: Record<string, unknown> = {};
              if (toolCall.arguments && toolCall.arguments.trim().length > 0) {
                try {
                  args = JSON.parse(toolCall.arguments);
                } catch {
                  args = {};
                }
              }
              return {
                functionCall: {
                  id:
                    toolCall.id || `call_${Math.random().toString(36).slice(2)}`,
                  name: toolCall.name,
                  args,
                },
              };
            },
          ),
          role: 'model',
        },
        index: 0,
        safetyRatings: [],
      },
    ];
    return res;
  }

  /**
   * Create final response for stream completion
   */
  static toGeminiStreamEndResponse(): GenerateContentResponse {
    const res = new GenerateContentResponse();
    res.candidates = [
      {
        content: {
          parts: [],
          role: 'model',
        },
        index: 0,
        safetyRatings: [],
      },
    ];
    return res;
  }

  /**
   * Create final response for stream completion
   */
  static toGeminiStreamUsageResponse(
    usage: OpenAI.Completions.CompletionUsage,
  ): GenerateContentResponse {
    const res = new GenerateContentResponse();
    res.candidates = [
      {
        content: {
          parts: [],
          role: 'model',
        },
        index: 0,
        safetyRatings: [],
      },
    ];
    res.usageMetadata = {
      promptTokenCount: usage.prompt_tokens || 0,
      candidatesTokenCount: usage.completion_tokens || 0,
      totalTokenCount: usage.total_tokens || 0,
    };
    return res;
  }

  /**
   * Update tool call map with streaming deltas
   */
  static updateToolCallMap(
    toolCallMap: ToolCallMap,
    toolCall: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall,
  ): void {
    const idx = toolCall.index;
    const current = toolCallMap.get(idx) || {
      id: '',
      name: '',
      arguments: '',
    };

    if (toolCall.id) {
      current.id = toolCall.id;
    }

    if (toolCall.function?.name) {
      current.name = toolCall.function.name;
    }

    if (toolCall.function?.arguments) {
      current.arguments += toolCall.function.arguments;
    }

    toolCallMap.set(idx, current);
  }

  /**
   * Process OpenAI streaming chunk and return Gemini response if needed
   */
  static processStreamChunk(
    chunk: OpenAI.Chat.Completions.ChatCompletionChunk,
    toolCallMap: ToolCallMap,
  ): { response: GenerateContentResponse | null; shouldReturn: boolean } {
    const usage = chunk.usage;
    const choice = chunk.choices?.[0];

    if (choice?.delta?.content) {
      return {
        response: this.toGeminiStreamTextResponse(choice.delta.content),
        shouldReturn: false,
      };
    }

    if (choice?.delta?.tool_calls) {
      for (const toolCall of choice.delta.tool_calls) {
        this.updateToolCallMap(toolCallMap, toolCall);
      }
    }

    if (choice?.finish_reason === 'tool_calls' && toolCallMap.size > 0) {
      const response = this.toGeminiStreamToolCallsResponse(toolCallMap);
      toolCallMap.clear();
      if (usage?.total_tokens) {
        response.usageMetadata = {
          promptTokenCount: usage.prompt_tokens || 0,
          candidatesTokenCount: usage.completion_tokens || 0,
          totalTokenCount: usage.total_tokens || 0,
        };
      }
      return {
        response,
        shouldReturn: false,
      };
    }

    if (choice?.finish_reason) {
      const response = this.toGeminiStreamEndResponse();
      if (usage?.total_tokens) {
        response.usageMetadata = {
          promptTokenCount: usage.prompt_tokens || 0,
          candidatesTokenCount: usage.completion_tokens || 0,
          totalTokenCount: usage.total_tokens || 0,
        };
      }
      return { response, shouldReturn: true };
    }

    if (usage?.total_tokens) {
      return {
        response: this.toGeminiStreamUsageResponse(usage),
        shouldReturn: true,
      };
    }

    return {
      response: null,
      shouldReturn: false,
    };
  }
}
