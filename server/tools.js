
export const tools = [
  {
    type: 'function',
    function: {
      name: 'create_payment_link',
      description:
        "Creates a Razorpay test-mode payment link for a given amount. Use this when the user clearly wants to request or send a payment, and you have at least a valid positive amount.",
      parameters: {
        type: 'object',
        properties: {
          amount: {
            type: 'number',
            description: 'Amount in INR rupees, e.g. 500 for ₹500. Must be a positive number.',
          },
          description: {
            type: 'string',
            description: "Short description of what the payment is for, e.g. 'Design work for Priya'.",
          },
          customer_name: { type: 'string' },
          customer_email: { type: 'string' },
          customer_phone: { type: 'string' },
        },
        required: ['amount', 'description'],
      },
    },
  },
];

// Business rule limits for a test/demo agent
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 500000; // ₹5,00,000 sanity cap

export async function executeTool(name, input, razorpayInstance) {
  if (name !== 'create_payment_link') {
    throw new Error('UNKNOWN_TOOL');
  }

  const { amount, description, customer_name, customer_email, customer_phone } = input;

  // --- Edge case: wrong / missing / invalid amount ---
  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    throw new Error('INVALID_AMOUNT');
  }
  if (amount < MIN_AMOUNT) {
    throw new Error('AMOUNT_TOO_LOW');
  }
  if (amount > MAX_AMOUNT) {
    throw new Error('AMOUNT_TOO_HIGH');
  }

  try {
    const paymentLink = await razorpayInstance.paymentLink.create({
      amount: Math.round(amount * 100), // paise
      currency: 'INR',
      description: description || 'Payment request',
      customer: {
        name: customer_name || undefined,
        email: customer_email || undefined,
        contact: customer_phone || undefined,
      },
      notify: { sms: false, email: false },
      reminder_enable: false,
    });

    return {
      short_url: paymentLink.short_url,
      amount,
      status: paymentLink.status,
      id: paymentLink.id,
    };
  } catch (err) {
    // --- Edge case: Razorpay API itself rejects the request ---
    console.error('Razorpay API error:', err?.error || err.message);
    throw new Error('RAZORPAY_API_ERROR');
  }
}