/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
} from '@google/genai';
import OpenAI from 'openai';
import { ContentGenerator } from '../core/contentGenerator.js';
import { CustomLLMContentGeneratorConfig, ToolCallMap } from './types.js';
import { extractToolFunctions } from './util.js';
import { ModelConverter } from './converter.js';

export class CustomLLMContentGenerator implements ContentGenerator {
  private model: OpenAI;
  private apiKey: string = process.env.CUSTOM_LLM_API_KEY || '';
  private baseURL: string = process.env.CUSTOM_LLM_ENDPOINT || '';
  private modelName: string = process.env.CUSTOM_LLM_MODEL_NAME || '';
  private temperature: number = Number(process.env.CUSTOM_LLM_TEMPERATURE || 0);
  private maxTokens: number = Number(process.env.CUSTOM_LLM_MAX_TOKENS || 8192);
  private topP: number = Number(process.env.CUSTOM_LLM_TOP_P || 1);
  private config: CustomLLMContentGeneratorConfig = {
    model: this.modelName,
    temperature: this.temperature,
    max_tokens: this.maxTokens,
    top_p: this.topP,
  };

  constructor() {
    this.model = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
    });
  }

  /**
   * Asynchronously generates content responses in a streaming fashion.
   * This method converts the input request to OpenAI format, invokes the model API,
   * and returns an asynchronous generator for real-time processing and streaming of responses.
   * It supports tool calls and uses a ToolCallMap to track tool invocation states.
   * @param request - Parameters for generating content, including prompts and configuration.
   * @returns An asynchronous generator that yields GenerateContentResponse objects
   *          until the stream ends or ter mination conditions are met.
   * @remarks This method is ideal for scenarios requiring real-time interaction, such as chat interfaces
   * or interactive applications. Stream responses are processed incrementally via ModelConverter.
   */
  async generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const messages = ModelConverter.toOpenAIMessages(request);
    const tools = extractToolFunctions(request.config) || [];
    if (process.env.EASY_LLM_CLI_DEBUG_TOOL_CALLS) {
      console.error(
        '[debug] openai tools:',
        JSON.stringify(tools.map((t) => t.function?.name)),
      );
    }
    const stream = await this.model.chat.completions.create({
      messages,
      stream: true,
      tools,
      stream_options: { include_usage: true },
      ...this.config,
    });
    const map: ToolCallMap = new Map();
    return (async function* (): AsyncGenerator<GenerateContentResponse> {
      for await (const chunk of stream) {
        if (process.env.EASY_LLM_CLI_DEBUG_TOOL_CALLS) {
          const choice = chunk?.choices?.[0];
          const delta = choice?.delta as any;
          if (delta?.tool_calls) {
            console.error(
              '[debug] stream tool_calls:',
              JSON.stringify(delta.tool_calls),
            );
          }
          if (delta?.content) {
            console.error('[debug] stream content:', JSON.stringify(delta.content));
          }
          if (delta?.reasoning_content) {
            console.error(
              '[debug] stream reasoning_content:',
              JSON.stringify(delta.reasoning_content),
            );
          }
          if (choice?.finish_reason) {
            console.error(
              '[debug] stream finish_reason:',
              JSON.stringify(choice.finish_reason),
            );
          }
        }
        const { response } = ModelConverter.processStreamChunk(chunk, map);
        if (response) {
          yield response;
        }
      }
    })();
  }

  /**
   * Asynchronously generates a complete content response.
   * This method converts the input request to OpenAI format, invokes the model API,
   * and waits for the full response before converting it to the Gemini API format.
   * @param request - Parameters for generating content, including prompts and configuration.
   * @returns A promise resolving to a complete GenerateContentResponse object.
   * @remarks This method is suitable for scenarios requiring the entire response at once,
   * such as batch processing or non-interactive applications.
   */
  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    const messages = ModelConverter.toOpenAIMessages(request);
    const wantsJson = request.config?.responseMimeType === 'application/json';
    const completion = await this.model.chat.completions.create({
      messages,
      stream: false,
      ...(wantsJson ? { response_format: { type: 'json_object' } } : {}),
      ...this.config,
    });

    return ModelConverter.toGeminiResponse(completion);
  }

  /**
   * Counts the total number of tokens in the given request contents.
   * This function approximates token count by analyzing different types of content
   * (English words, Chinese characters, numbers, punctuations, and spaces)
   * and applying different weighting factors to each type.
   */
  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    const messages = ModelConverter.toOpenAIMessages(request);
    const text = messages.map((m) => m.content).join(' ');
    const englishWords = (text.match(/[a-zA-Z]+[']?[a-zA-Z]*/g) || []).length;
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const numbers = (text.match(/\b\d+\b/g) || []).length;
    const punctuations = (
      text.match(/[.,!?;:"'(){}[\]<>@#$%^&*\-_+=~`|\\/]/g) || []
    ).length;
    const spaces = Math.ceil((text.match(/\s+/g) || []).length / 5);
    const totalTokens = Math.ceil(
      englishWords * 1.2 +
        chineseChars * 1 +
        numbers * 0.8 +
        punctuations * 0.5 +
        spaces,
    );
    return {
      totalTokens,
    };
  }

  /**
   * This function has not been implemented yet.
   */
  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw Error();
  }
}
