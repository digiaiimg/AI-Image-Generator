import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";

/**
 * Implements exponential backoff for API calls, retrying on 429 (Too Many Requests)
 * or specific API key related errors.
 * @param {() => Promise<T>} fn The function to execute.
 * @param {number} attempts Maximum number of retry attempts.
 * @param {number} delay Initial delay in milliseconds before retrying.
 * @returns {Promise<T>} The result of the function call.
 * @template T
 */
async function withExponentialBackoff<T>(fn: () => Promise<T>, attempts: number = 3, delay: number = 1000): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error: any) {
      // Check if it's a retriable error (429 or permission/billing issues)
      const isRetriableError = (error.status === 429) || 
                                (error.message?.includes("Requested entity was not found.")) ||
                                (error.status === 403);

      if (i === attempts - 1 || !isRetriableError) {
        throw error; // Re-throw if it's the last attempt or not a retriable error
      }
      console.warn(`Attempt ${i + 1} failed. Retrying in ${delay}ms...`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential increase
    }
  }
  throw new Error("Maximum retry attempts reached.");
}

/**
 * Generates an image using the Gemini API.
 * Uses `imagen-4.0-generate-001` for general image generation tasks with direct aspect ratio control.
 * @param {string} prompt The text prompt for image generation.
 * @param {string} aspectRatio The desired aspect ratio (e.g., '1:1', '16:9').
 * @returns {Promise<string | undefined>} A base64 data URL of the generated image, or undefined if generation fails.
 */
export async function generateImageGemini(
  prompt: string,
  aspectRatio: string,
): Promise<string | undefined> {
  // The API key is assumed to be available via process.env.API_KEY.

  return await withExponentialBackoff(async () => {
    // Instantiate GoogleGenAI just before the call to ensure the latest API key is used.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

    try {
      const fullPrompt = `${prompt}, high quality, professional, highly detailed.`;
      const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001', // Model switched to imagen-4.0-generate-001
        prompt: fullPrompt,
        config: {
          numberOfImages: 1,
          aspectRatio: aspectRatio, // Direct aspect ratio control
          outputMimeType: 'image/png', // Specify output MIME type
        },
      });

      if (response.generatedImages && response.generatedImages[0] && response.generatedImages[0].image.imageBytes) {
        return `data:image/png;base64,${response.generatedImages[0].image.imageBytes}`;
      }
      return undefined;
    } catch (error: any) {
      console.error('Imagen image generation error:', error);
      throw error;
    }
  });
}

/**
 * Edits an existing image using the Gemini API.
 * Uses `gemini-2.5-flash-image` for image editing tasks.
 * @param {string} prompt The text instruction for editing the image.
 * @param {string} base64ImageData The base64 encoded image data (without the data URL prefix).
 * @param {string} [mimeType='image/png'] The MIME type of the image.
 * @returns {Promise<string | undefined>} A base64 data URL of the edited image, or undefined if editing fails.
 */
export async function editImageGemini(
  prompt: string,
  base64ImageData: string,
  mimeType: string = 'image/png'
): Promise<string | undefined> {
  // The API key is assumed to be available via process.env.API_KEY.

  return await withExponentialBackoff(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image', // Recommended model for image editing
        contents: {
          parts: [
            { text: `Edit this image based on the following instruction: ${prompt}. Return ONLY the edited image.` },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64ImageData,
              },
            },
          ],
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      return undefined;
    } catch (error: any) {
      console.error('Gemini image editing error:', error);
      throw error;
    }
  });
}

/**
 * Defines the structure for chat messages.
 */
export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

/**
 * Sends a message to the Gemini chat model and retrieves its response.
 * Uses `gemini-2.5-flash` for chat interactions.
 * @param {ChatMessage[]} history The current conversation history.
 * @param {string} newMessage The new message from the user.
 * @returns {Promise<string | undefined>} The model's response text, or undefined if no response.
 */
export async function sendChatMessageGemini(
  history: ChatMessage[],
  newMessage: string
): Promise<string | undefined> {
  return await withExponentialBackoff(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

    try {
      // Create a chat session with initial history and a system instruction
      const chat = ai.chats.create({
        model: 'gemini-2.5-flash', // Recommended model for basic chat
        config: {
          systemInstruction: {
            parts: [{ text: "You are 'Digi AI Assistant', a highly professional, mannerful, and helpful problem-solving AI. Your goal is to provide clear, effective, and supportive solutions to user problems. Maintain a warm, encouraging, and sophisticated tone, similar to a premium consultant or mentor." }]
          }
        },
        // Populate chat history from the provided history array
        history: history.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        }))
      });

      // Send the new message; the chat object manages its internal context/history
      const response: GenerateContentResponse = await chat.sendMessage({ message: newMessage });
      return response.text;
    } catch (error: any) {
      console.error('Gemini chat error:', error);
      throw error;
    }
  });
}
