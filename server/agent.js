import Anthropic from '@anthropic-ai/sdk';
import { tools, executeTool } from './tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a payment assistant for a business using Razorpay in TEST mode.
Users describe a payment request in natural language.

Rules:
- If the request has a clear positive amount and a reasonable description, call create_payment_link.
- If the amount is missing, zero, negative, or not a real number, do NOT call any tool — ask one short clarifying question instead.
- If the user talks about cancelling, or a failed/declined payment, do not call any tool. Acknowledge briefly and offer to create a new payment link if they'd like.
- If a tool call fails, apologize in plain, simple language and suggest what to check (e.g. a valid amount) — never expose raw error codes or technical details.
- Keep every reply to 1-3 short sentences. Amounts are always in INR rupees.`;

const MODEL = 'claude-sonnet-4-6';

export async function runAgent(userMessage, razorpayInstance) {
  const messages = [{ role: 'user', content: userMessage }];

  let response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    tools,
    messages,
  });

  let paymentLink = null;
  let safety = 0; // guard against runaway tool loops

  while (response.stop_reason === 'tool_use' && safety < 3) {
    safety += 1;
    const toolUseBlock = response.content.find((b) => b.type === 'tool_use');
    messages.push({ role: 'assistant', content: response.content });

    let toolResultContent;
    try {
      const result = await executeTool(toolUseBlock.name, toolUseBlock.input, razorpayInstance);
      if (result.short_url) paymentLink = result;
      toolResultContent = JSON.stringify(result);
    } catch (err) {
      // Feed the error back to Claude so it can respond with a graceful fallback message
      toolResultContent = JSON.stringify({ error: true, reason: err.message });
    }

    messages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseBlock.id,
          content: toolResultContent,
        },
      ],
    });

    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  return {
    reply: textBlock ? textBlock.text : "Sorry, I couldn't process that — please try rephrasing.",
    paymentLink,
  };
}