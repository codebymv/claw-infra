const PATTERNS = {
    llmProvider: /provider[=:\s]+[`"']?(\w+)[`"']?/i,
    llmModel: /model[=:\s]+[`"']?([\w./-]+)[`"']?/i,
    llmTokensIn: /(?:input_tokens|tokens_in|prompt_tokens)[=:\s]+(?:Some\()?(\d+)\)?/i,
    llmTokensOut: /(?:output_tokens|tokens_out|completion_tokens)[=:\s]+(?:Some\()?(\d+)\)?/i,
    llmCost: /cost[=:\s]+(?:Some\()?\$?([\d.]+)\)?/i,
};

const message = "provider=openrouter model=anthropic/claude-sonnet-4-6 input_tokens=Some(6475) output_tokens=Some(48) cost=Some(0.02)";

const providerMatch = PATTERNS.llmProvider.exec(message);
const modelMatch = PATTERNS.llmModel.exec(message);
const tokensInMatch = PATTERNS.llmTokensIn.exec(message);
const tokensOutMatch = PATTERNS.llmTokensOut.exec(message);
const costMatch = PATTERNS.llmCost.exec(message);

console.log({
    provider: providerMatch?.[1],
    model: modelMatch?.[1],
    tokensIn: tokensInMatch?.[1],
    tokensOut: tokensOutMatch?.[1],
    cost: costMatch?.[1]
});
