import { useState, useRef, useEffect } from 'react';

const initialMessage = {
  role: 'agent',
  text: 'Hi, I can create a test payment link for you. Try: "Send a ₹500 request to Priya for the design work".',
};

export default function App() {
  const [messages, setMessages] = useState([initialMessage]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: 'agent', text: data.reply, paymentLink: data.paymentLink }]);
    } catch (err) {
      // Edge case: server unreachable / network failure
      setMessages((m) => [
        ...m,
        { role: 'agent', text: "I couldn't reach the server. Check your connection and try again.", paymentLink: null },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="page">
      <div className="panel">
        <header className="panel-header">
          <div className="mark">₹</div>
          <div>
            <h1>Payment Agent</h1>
            <p>Razorpay test mode · powered by Claude</p>
          </div>
        </header>

        <div className="thread" ref={scrollRef}>
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              <p>{m.text}</p>
              {m.paymentLink && (
                <a className="link-card" href={m.paymentLink.short_url} target="_blank" rel="noreferrer">
                  <span className="link-card-amount">₹{m.paymentLink.amount}</span>
                  <span className="link-card-label">Open payment link</span>
                </a>
              )}
            </div>
          ))}
          {loading && (
            <div className="bubble agent typing">
              <span></span>
              <span></span>
              <span></span>
            </div>
          )}
        </div>

        <div className="composer">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the payment you want to create..."
          />
          <button onClick={sendMessage} disabled={loading || !input.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}