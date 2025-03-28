// Script to test image generation functionality

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }

      const fileStream = fs.createWriteStream(filepath);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });

      fileStream.on('error', (err) => {
        fs.unlink(filepath, () => {});
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function generateAndSaveImage() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Please provide an OpenAI API key as an environment variable");
    return;
  }

  console.log("Creating OpenAI client...");
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  // Make sure the images directory exists
  const imagesDir = path.join(process.cwd(), 'public', 'images', 'stories');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
    console.log(`Created directory: ${imagesDir}`);
  }

  // Create a filename for the new image
  const filename = `test_image_${Date.now()}.png`;
  const filepath = path.join(imagesDir, filename);
  
  // Append biblical art style to the prompt
  const imagePrompt = "A child named Lucy with a sheep in a biblical garden of Eden setting. Render in a beautiful, child-friendly biblical illustration style with soft colors.";
  
  console.log(`Generating image with prompt: ${imagePrompt}`);
  
  try {
    // Call DALL-E API to generate the image
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "vivid",
    });

    // Download the image
    if (response.data[0]?.url) {
      console.log("Image generated successfully. Downloading...");
      await downloadImage(response.data[0].url, filepath);
      console.log(`Image saved to: ${filepath}`);
      console.log(`Access URL: /public/images/stories/${filename}`);
    } else {
      console.error("No image URL returned from OpenAI");
    }
  } catch (error) {
    console.error("Error generating image with DALL-E:", error);
  }
}

generateAndSaveImage().catch(console.error);