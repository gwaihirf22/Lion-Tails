import { createNewChat, sendMessage } from 'deepseek-api';

// Get the API key from environment variable
const deepseekToken = process.env.DEEPSEEK_API_KEY;

console.log("Testing DeepSeek connection...");
console.log("Using token:", deepseekToken ? deepseekToken.substring(0, 5) + '...' : 'None provided');

async function testDeepSeek() {
  try {
    // Create a new chat session with DeepSeek
    console.log("Attempting to create a new chat...");
    const chatID = await createNewChat(deepseekToken);
    
    if (typeof chatID !== 'string') {
      console.error("Failed to create DeepSeek chat:", chatID.error);
      return;
    }
    
    console.log("Chat created successfully with ID:", chatID);
    
    // Send a test message
    console.log("Sending a test message...");
    let responseData = '';
    
    await sendMessage("Tell me a short story about a lion", {
      id: chatID,
      token: deepseekToken,
    }, (chunk) => {
      if (chunk.type === 'message') {
        responseData += chunk.content || '';
        console.log("Received chunk:", chunk.content ? chunk.content.substring(0, 30) + '...' : 'empty');
      }
    });
    
    console.log("Full response:", responseData.substring(0, 200) + '...');
    console.log("Test completed successfully!");
    
  } catch (error) {
    console.error("Error testing DeepSeek:", error);
  }
}

testDeepSeek();