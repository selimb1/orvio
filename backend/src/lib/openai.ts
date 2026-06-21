import OpenAI from 'openai';
import { env } from '../utils/env';

export const openai = new OpenAI({
  apiKey: env.openaiApiKey(),
});
