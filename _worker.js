// worker.js (TESTING VERSION - UNSAFE FOR PRODUCTION)
export default {
  async fetch(request) {
    const url = new URL(request.url);
    
    // Hardcoded configuration (FOR TESTING ONLY)
    const config = {
      fbVerifyToken: "YOUR_TEST_FB_VERIFY_TOKEN",
      fbPageAccessToken: "YOUR_TEST_FB_PAGE_ACCESS_TOKEN",
      deepseekApiKey: "899f1189-a2f7-4703-9cdf-25303b0a4c1a",
      deepseekEndpoint: "https://kaiz-apis.gleeze.com/api/deepseek-v3"
    };
    
    // Facebook Webhook Verification
    if (url.pathname === '/webhook' && request.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      
      if (mode === 'subscribe' && token === config.fbVerifyToken) {
        return new Response(challenge, { status: 200 });
      }
      return new Response('Verification failed', { status: 403 });
    }
    
    // Facebook Message Handling
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const body = await request.json();
        
        if (body.object !== 'page') {
          return new Response('Invalid object', { status: 400 });
        }
        
        // Process each entry
        for (const entry of body.entry) {
          for (const event of entry.messaging) {
            if (event.message) {
              await processMessage(event, config);
            }
          }
        }
        
        return new Response('EVENT_RECEIVED', { status: 200 });
      } catch (error) {
        console.error('Error handling message:', error);
        return new Response('ERROR_PROCESSING', { status: 500 });
      }
    }
    
    // Simple status page
    if (url.pathname === '/') {
      return new Response('Facebook Bot Worker (TEST MODE) is running\n\n' + 
        'Endpoints:\n' +
        '- GET /webhook - Facebook verification\n' +
        '- POST /webhook - Message handling', 
        { status: 200 });
    }
    
    return new Response('Not Found', { status: 404 });
  }
}

// Process individual message and respond
async function processMessage(event, config) {
  const senderId = event.sender.id;
  const messageText = event.message.text;
  
  // Get AI response (with error handling)
  let aiResponse;
  try {
    const apiUrl = `${config.deepseekEndpoint}?ask=${encodeURIComponent(messageText)}&apikey=${config.deepseekApiKey}`;
    const response = await fetch(apiUrl);
    
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    
    const data = await response.json();
    aiResponse = data.response || "I couldn't generate a response.";
  } catch (error) {
    console.error('DeepSeek API error:', error);
    aiResponse = "Sorry, I'm having trouble thinking right now.";
  }
  
  // Send response to Facebook
  await sendFacebookMessage(senderId, aiResponse, config);
}

// Send message through Facebook Messenger API
async function sendFacebookMessage(recipientId, messageText, config) {
  const responseData = {
    recipient: { id: recipientId },
    message: { text: messageText }
  };
  
  try {
    const fbResponse = await fetch(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${config.fbPageAccessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(responseData)
      }
    );
    
    if (!fbResponse.ok) {
      const errorData = await fbResponse.json();
      console.error('Facebook API error:', errorData);
    }
  } catch (error) {
    console.error('Error sending Facebook message:', error);
  }
}
