import React, { useState, useCallback, useMemo } from 'react';
import { Download, Zap, Image, Upload } from 'lucide-react';
import { GoogleGenAI } from "@google/genai"; // Modality is not needed for generateImages

// Utility function to convert a File object to a Base64 string for the API
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result.split(',')[1]); // Only get the base64 data part
      } else {
        reject(new Error("Failed to read file as string."));
      }
    };
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
};

// Utility function to convert Base64 Data URL to a Blob
const dataUrlToBlob = (dataurl: string): Blob => {
  const parts = dataurl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while(n--){
      u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], {type:mime});
};

// The API key must be obtained exclusively from the environment variable process.env.API_KEY.
const API_KEY = process.env.API_KEY;

const App: React.FC = () => {
  // State for image generation
  const [prompt, setPrompt] = useState<string>(''); // Changed initial prompt to empty string
  const [imageFile, setImageFile] = useState<File | null>(null); // Image file for reference (not directly used by API for generation)
  const [generatedImageURL, setGeneratedImageURL] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9'); // '16:9', '9:16', or '1:1'
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Tailwind classes to control the container aspect ratio in the UI.
  // Assumes Tailwind's aspect-ratio plugin is available or custom CSS provides these.
  const aspectRatioClasses = useMemo(() => ({
    '16:9': 'aspect-w-16 aspect-h-9',
    '9:16': 'aspect-w-9 aspect-h-16',
    '1:1': 'aspect-w-1 aspect-h-1',
  }), []);

  // Handler for file upload (for inspiration/reference only)
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError("Please upload a valid image file.");
        setImageFile(null);
        return;
      }
      // Implement a client-side size limit (e.g., 5MB)
      if (file.size > 1024 * 1024 * 5) {
        setError("Image is too large. Please upload an image smaller than 5MB.");
        setImageFile(null);
        return;
      }
      setImageFile(file);
      setError(null);
    } else {
      setImageFile(null);
    }
  };
  
  // Main generation function using `imagen-4.0-generate-001` for guaranteed aspect ratio
  const generateImage = useCallback(async () => {
    if (!prompt.trim()) {
      setError("Please enter a creative prompt.");
      return;
    }

    setIsLoading(true);
    setGeneratedImageURL(null);
    setError(null);

    // Instantiate GoogleGenAI inside the function to ensure the latest API_KEY is used.
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    try {
      const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001', // High-quality image generation with aspect ratio control
        prompt: prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/png', // Using PNG for output
          aspectRatio: aspectRatio, // Directly use the selected aspect ratio
        },
      });

      const generatedImage = response.generatedImages?.[0]?.image;

      if (generatedImage?.imageBytes) {
        setGeneratedImageURL(`data:${generatedImage.mimeType || 'image/png'};base64,${generatedImage.imageBytes}`);
      } else {
        throw new Error("Image generation failed: No image data received.");
      }

    } catch (e: any) {
      console.error('Final error:', e);
      setError(`Failed to generate image: ${e.message.slice(0, 150)}...`);
    } finally {
      setIsLoading(false);
    }
  }, [prompt, aspectRatio, API_KEY]); // aspectRatio is now a dependency for the API call.

  // Handler for downloading the image
  const downloadImage = useCallback(() => {
    if (generatedImageURL) {
      const blob = dataUrlToBlob(generatedImageURL);
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `digi-ai-image-${aspectRatio.replace(':', 'x')}-${Date.now()}.png`;
      
      document.body.appendChild(link);
      link.click();
      
      document.body.removeChild(link);
      URL.revokeObjectURL(url); // Free up memory
    }
  }, [generatedImageURL, aspectRatio]);

  // UI Component: Upload Section
  const UploadSection: React.FC = () => (
    <div className="flex flex-col items-center p-4 border border-dashed border-indigo-500/50 rounded-xl bg-gray-800/50">
      <label htmlFor="image-upload" className="w-full cursor-pointer">
        <div className="flex flex-col items-center justify-center p-4">
          <Upload className="w-6 h-6 text-indigo-400 mb-2" />
          <p className="text-sm text-gray-300 font-medium text-center">
            {imageFile ? (
              <span className="text-green-400">Image loaded: {imageFile.name}</span>
            ) : (
              'Optional: Upload a reference image (for inspiration)'
            )}
          </p>
          <p className="text-xs text-gray-500 mt-1 text-center">PNG, JPG (Max 5MB)</p>
        </div>
        <input
          id="image-upload"
          type="file"
          accept="image/png, image/jpeg" // Restrict to png and jpeg for better compatibility
          onChange={handleFileChange}
          className="hidden"
          disabled={isLoading}
        />
      </label>
      {imageFile && (
        <button
          onClick={() => setImageFile(null)}
          className="text-xs text-red-400 hover:text-red-300 mt-2 p-1 rounded-md transition duration-150 border border-red-500/50 hover:bg-red-500/20"
        >
          Remove Image
        </button>
      )}
    </div>
  );

  // UI Component: Aspect Ratio Selector
  const AspectRatioSelector: React.FC = () => (
    <div className="flex justify-center bg-gray-700/50 p-1 rounded-xl shadow-inner">
      {['16:9', '9:16', '1:1'].map((ratio) => (
        <button
          key={ratio}
          onClick={() => setAspectRatio(ratio as '16:9' | '9:16' | '1:1')}
          disabled={isLoading}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200
            ${aspectRatio === ratio
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-gray-300 hover:bg-gray-600'
            }`}
        >
          {ratio} ({ratio === '16:9' ? 'Landscape' : ratio === '9:16' ? 'Portrait' : 'Square'})
        </button>
      ))}
    </div>
  );

  // UI Component: Image Display Area
  const ImageDisplay: React.FC = () => (
    <div className="p-4 bg-gray-800 rounded-xl shadow-2xl h-full flex flex-col items-center justify-center">
      <div
        className={`w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-lg overflow-hidden transition-all duration-300 ${aspectRatioClasses[aspectRatio]}`}
      >
        <div className="flex items-center justify-center w-full h-full bg-gray-900">
          {isLoading && (
            <div className="flex flex-col items-center justify-center p-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400 mb-4"></div>
              <p className="text-indigo-400 font-medium text-center">
                Generating high-quality image...
              </p>
            </div>
          )}
          {error && (
            <div className="p-4 text-center text-red-400 bg-red-900/50 rounded-lg m-4">
              <p className="font-semibold">Error:</p>
              <p className="text-sm">{error}</p>
            </div>
          )}
          {generatedImageURL && !isLoading && !error && (
            <img
              src={generatedImageURL}
              alt="Generated AI Image"
              className="w-full h-full object-cover" // object-cover ensures the image fills the aspect ratio container, given it's now a fixed ratio
            />
          )}
          {!isLoading && !error && !generatedImageURL && (
            <div className="text-center text-gray-500 p-8">
              <Image className="w-10 h-10 mx-auto mb-2" />
              <p>Your high-quality AI creation will appear here.</p>
              <p className="text-xs mt-1"></p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-8 font-sans">
      <header className="text-center mb-8">
        <h1 className="text-4xl font-extrabold text-indigo-400 mb-2">
          DIGI AI Image Generator
        </h1>
        <p className="text-gray-400">High-fidelity generation powered by Dream It, Get It technology.</p>
        <p className="text-gray-500 text-sm mt-1"></p>
      </header>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Control Panel (Left/Top) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
            <h2 className="text-xl font-semibold mb-3 flex items-center">
              <Zap className="w-5 h-5 mr-2 text-yellow-400" />
              Image Prompt
            </h2>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to create..."
              rows={5}
              className="w-full p-3 bg-gray-700/70 border border-gray-600 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-white resize-none"
              disabled={isLoading}
            />
          </div>

          <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700 space-y-4">
            <h2 className="text-xl font-semibold mb-4">Settings</h2>
            <div className="space-y-2">
              <label className="text-gray-300 font-medium block">Aspect Ratio</label>
              <AspectRatioSelector />
            </div>
            <UploadSection />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={generateImage}
              disabled={isLoading || !prompt.trim()}
              className="flex-1 flex items-center justify-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/50 transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02]"
            >
              <Zap className="w-5 h-5 mr-2" />
              {isLoading ? 'Generating...' : 'Generate Image'}
            </button>
            <button
              onClick={downloadImage}
              disabled={!generatedImageURL || isLoading}
              className="flex-1 flex items-center justify-center px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg shadow-green-500/50 transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02]"
            >
              <Download className="w-5 h-5 mr-2" />
              Download
            </button>
          </div>
        </div>

        {/* Output Display (Right/Bottom) */}
        <div className="lg:col-span-2 min-h-[50vh] flex items-center justify-center">
          <ImageDisplay />
        </div>
      </div>

      <footer className="text-center mt-12 text-gray-500 text-sm">
        <p>Powered by Gemini Image Generation API</p>
      </footer>
    </div>
  );
};

export default App;