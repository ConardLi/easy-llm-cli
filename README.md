![Easy LLM CLI Screenshot](./docs/assets/openrouter.png)

<div align="center">

<h4>  An open-source AI agent that is compatible with multiple LLM models（a forked version of Gemini CLI）.  </h4>

[English](./README.md) | [简体中文](./README.zh-CN.md)

</div>

This repository contains the Easy LLM CLI（[Gemini Cli](https://github.com/google-gemini/gemini-cli) version of the Fork）, a command-line AI workflow tool that connects to your
tools, understands your code and accelerates your workflows. It supports multiple LLM providers including Gemini, OpenAI, and any custom LLM API that follows OpenAI's API format.


With the Easy LLM CLI you can:

- Query and edit large codebases using advanced LLM capabilities with large context windows.
- Generate new apps from PDFs or sketches, using multimodal capabilities.
- Automate operational tasks, like querying pull requests or handling complex rebases.
- Use tools and MCP servers to connect new capabilities.
- Configure and use your preferred LLM provider through simple environment variables.
- Seamlessly switch between different LLM providers without changing your workflow.

<hr />

This plan has conducted tests on various models from different providers as well as locally deployed models across multiple dimensions, including whether they have thinking chain, whether they can complete simple tasks, whether they have tool - calling capabilities, whether they have multimodal capabilities, whether they have complex task capabilities, and whether they can count tokens. The following are the test results:

| Model | COT | Simple | Tool | MCP | Complex | Multimodal | Token |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 【Google】Gemini-2.5-pro | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 【OpenRouter】Claude Sonnet 4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 【OpenRouter】Gpt-4.1 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 【OpenRouter】Grok-4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 【Volcengine】Doubao-Seed-1.6 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 【Bailian】Qwen3-Plus | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 【Moonshot】kimi-k2 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 【Volcengine】DeepSeek-R1 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 【Siliconflow】DeepSeek-R1 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 【Volcengine】Doubao-1.5-Pro | ❌ | ✅ | ✅ | ✅ | ⚠️ | ❌ | ✅ |
| 【Volcengine】DeepSeek-V3 | ❌ | ✅ | ✅ | ✅ | ⚠️ | ❌ | ✅ |
| 【Bailian】Qwen3-235b-a22b | ✅ | ✅ | ✅ | ✅ | ⚠️ | ❌ | ✅ |
| 【vLLM】Qwen2.5-7B-Instruct | ❌ | ✅ | ✅ | ✅ | ⚠️ | ❌ | ✅ |
| 【vLLM】DeepSeek-R1-32B | ✅ | ✅ | ✅ | ✅ | ⚠️ | ❌ | ✅ |
| 【Ollama】Qwen2.5-7B-Instruct | ❌ | ✅ | ✅ | ✅ | ⚠️ | ❌ | ✅ |

## Quickstart

1. **Prerequisites:** Ensure you have [Node.js version 20](https://nodejs.org/en/download) or higher installed.
2. **Run the CLI:** Execute the following command in your terminal:

   ```bash
   npx easy-llm-cli
   ```

   Or install it with:

   ```bash
   npm install -g easy-llm-cli
   elc
   ```


## Custom LLM Configuration

Easy LLM CLI supports connecting to any OpenAI-compatible LLM API. You can configure your preferred LLM using these environment variables:

```bash
# Enable custom LLM support
export USE_CUSTOM_LLM=true 

export CUSTOM_LLM_PROVIDER="openai"  # LLM provider, if you use azure openai, set to "azure"
export CUSTOM_LLM_API_KEY="your-api-key"     # Your LLM provider API key
export CUSTOM_LLM_ENDPOINT="https://api.your-llm-provider.com/v1"  # API endpoint
export CUSTOM_LLM_MODEL_NAME="your-model-name"  # Model name

# Optional parameters
export CUSTOM_LLM_TEMPERATURE=0.7  # Temperature (default: 0)
export CUSTOM_LLM_MAX_TOKENS=8192  # Max tokens (default: 8192)
export CUSTOM_LLM_TOP_P=1          # Top P (default: 1)
```

When these variables are set, Easy LLM CLI will use your custom LLM instead of the default Gemini model.


## Examples

Once the CLI is running, you can start interacting with Gemini from your shell.

You can start a project from a new directory:

```sh
cd new-project/
elc
> Write me a Discord bot that answers questions using a FAQ.md file I will provide
```

Or work with an existing project:

```sh
git clone https://github.com/ConardLi/easy-llm-cli
cd easy-llm-cli
elc
> Give me a summary of all of the changes that went in yesterday
```

## Running in Code

Easy LLM supports direct integration into your code via NPM:

```javascript
import { ElcAgent } from 'easy-llm-cli';

const agent = new ElcAgent({
  model: 'custom-llm-model-name',
  apiKey: 'custom-llm-api-key',
  endpoint: 'custom-llm-endpoint',
  extension: {
    mcpServers: {
      chart: {
        command: 'npx',
        args: ['-y', '@antv/mcp-server-chart'],
        trust: false
      }
    },
    excludeTools: ['run_shell_command']
  }
});

const result = await agent.run('Please generate a bar chart for sales data');
console.log(result);
```

- View detailed API documentation: [Programmatic API](./docs/programmatic-api.md)


### Next steps

- Learn how to [contribute to or build from the source](./CONTRIBUTING.md).
- Explore the available **[CLI Commands](./docs/cli/commands.md)**.
- If you encounter any issues, review the **[Troubleshooting guide](./docs/troubleshooting.md)**.
- For more comprehensive documentation, see the [full documentation](./docs/index.md).
- Take a look at some [popular tasks](#popular-tasks) for more inspiration.

### Troubleshooting

Head over to the [troubleshooting](docs/troubleshooting.md) guide if you're
having issues.

## Popular tasks

### Explore a new codebase

Start by `cd`ing into an existing or newly-cloned repository and running `elc`.

```text
> Describe the main pieces of this system's architecture.
```

```text
> What security mechanisms are in place?
```

### Work with your existing code

```text
> Implement a first draft for GitHub issue #123.
```

```text
> Help me migrate this codebase to the latest version of Java. Start with a plan.
```

### Automate your workflows

Use MCP servers to integrate your local system tools with your enterprise collaboration suite.

```text
> Make me a slide deck showing the git history from the last 7 days, grouped by feature and team member.
```

```text
> Make a full-screen web app for a wall display to show our most interacted-with GitHub issues.
```

### Interact with your system

```text
> Convert all the images in this directory to png, and rename them to use dates from the exif data.
```

```text
> Organize my PDF invoices by month of expenditure.
```

