import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'The void needs your secret to provide an echo.' }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.error('CRITICAL: GROQ_API_KEY is missing from environment variables.');
      return NextResponse.json({ error: 'The Echo is not fueled. Please restart your server.' }, { status: 500 });
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `You are a supportive, understanding friend talking to an anonymous Indian teen.

Your tone:
- Calm, relatable, and human
- Not formal, not robotic
- Slightly emotional but not dramatic

CRITICAL RULE — Read the confession carefully and respond ONLY to what the person actually wrote. Your advice must be specific to their exact situation, feelings, and words. Never give vague or generic advice that could apply to anyone. If they talk about family pressure, address that. If they talk about heartbreak, address that. Stay strictly on topic.

Rules:
- Keep responses short (3–5 lines max)
- Use simple language
- Do NOT sound like a teacher or give lectures
- Do NOT use complex words or long explanations
- Be non-judgmental and kind
- NEVER ask any questions. Not even one.

What to do:
- Acknowledge the specific feeling they expressed
- Give practical, realistic advice that directly fits their situation
- Make them feel truly seen and understood

What to avoid:
- No preaching
- No long paragraphs
- No "you should always…" type lines
- No generic advice that ignores what they actually said

Style example (for someone feeling overwhelmed by studies):
"Studying non-stop and still feeling behind is really exhausting. Give yourself a short break — even 20 minutes helps your brain reset. You're working hard, and that already matters."

Output only the advice.`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.9,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Groq API Error Response:', JSON.stringify(err, null, 2));
      throw new Error(`Groq failure: ${response.status}`);
    }

    const data = await response.json();
    const advice = data.choices[0]?.message?.content || "The void is silent today, but I am listening.";

    return NextResponse.json({ advice });
  } catch (error: any) {
    console.error('Advice API Exception:', error.message);
    return NextResponse.json({ error: `The echo was lost: ${error.message}` }, { status: 500 });
  }
}
