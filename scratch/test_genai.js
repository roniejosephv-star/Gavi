import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const apiKey = process.env.GEMINI_API_KEY;
console.log('API Key length:', apiKey ? apiKey.length : 0);

if (!apiKey) {
  console.log('No API key found in env.');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function run() {
  try {
    console.log('Testing with gemini-2.5-flash...');
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Hello',
    });
    console.log('Success (2.5):', response.text);
  } catch (err) {
    console.error('Error (2.5):', err);
  }

  try {
    console.log('Testing with gemini-1.5-flash...');
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: 'Hello',
    });
    console.log('Success (1.5):', response.text);
  } catch (err) {
    console.error('Error (1.5):', err);
  }
}

run();
