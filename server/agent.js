import Groq from 'groq-sdk';
import { tools, executeTool } from './tools.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are a payment assistant for a business using Razorpay in TEST mode.
Users describe a payment request in natural language.

Rules:
- If the request has a clear positive amount and a reasonable description, call create_payment_link.
- If the amount is missing, zero, negative, or not a real number, do NOT call any tool — ask one short clarifying question instead.
- If the user talks about cancelling, or a failed/declined payment, do not call any tool. Acknowledge briefly and offer to create a new payment link if they'd like.
- If a tool call fails, apologize in plain, simple language and suggest what to check (e.g. a valid amount) — never expose raw error codes or technical details.
- Keep every reply to 1-3 short sentences. Amounts are always in INR rupees.`;

const MODEL = 'qwen/qwen3.8-27b';

export async function runAgent(userMessage, razorpayInstance) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];

  let response = await groq.chat.completions.create({
    model: MODEL,
    messages,
    tools,
    tool_choice: 'auto',
    max_tokens: 350,
  });

  let responseMessage = response.choices[0].message;
  let paymentLink = null;
  let safety = 0; // guard against runaway tool loops

  while (responseMessage.tool_calls && responseMessage.tool_calls.length > 0 && safety < 3) {
    safety += 1;
    const toolCall = responseMessage.tool_calls[0];
    const toolArgs = JSON.parse(toolCall.function.arguments);

    messages.push(responseMessage);

    let toolResultContent;
    try {
      const result = await executeTool(toolCall.function.name, toolArgs, razorpayInstance);
      if (result.short_url) paymentLink = result;
      toolResultContent = JSON.stringify(result);
    } catch (err) {
      toolResultContent = JSON.stringify({ error: true, reason: err.message });
    }

    messages.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: toolResultContent,
    });

    response = await groq.chat.completions.create({
      model: MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      max_tokens: 350,
    });

    responseMessage = response.choices[0].message;
  }

  return {
    reply: responseMessage.content || "Sorry, I couldn't process that — please try rephrasing.",
    paymentLink,
  };
}