const SMS_API_URL = 'https://vercelapi-rouge-three.vercel.app/api/sms';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    // Handle webhook verification (GET request to /webhooks)
    if (request.method === 'GET' && pathname === '/webhooks') {
      return handleWebhookVerification(request, env);
    } 
    // Handle incoming messages (POST request to /webhooks)
    else if (request.method === 'POST' && pathname === '/webhooks') {
      return handleWebhookEvent(request, env, ctx);
    } 
    // Handle root path
    else if (request.method === 'GET' && pathname === '/') {
      return new Response('🤖 Facebook SMS Bot is running!\n\nWebhook endpoint: /webhooks', {
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    else {
      return new Response('Not Found', { status: 404 });
    }
  },
};

// Handle webhook verification
async function handleWebhookVerification(request, env) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  // Use environment variables for security
  const VERIFY_TOKEN = 'mytoken';

  console.log('Webhook verification attempt:', { mode, token, challenge });

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ WEBHOOK_VERIFIED');
      return new Response(challenge, { 
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    } else {
      console.log('❌ Verification failed - token mismatch');
      return new Response('Verification failed', { status: 403 });
    }
  }
  
  return new Response('Missing verification parameters', { status: 400 });
}

// Handle incoming webhook events
async function handleWebhookEvent(request, env, ctx) {
  try {
    const body = await request.json();
    console.log('Received webhook event:', JSON.stringify(body));
    
    if (body.object === 'page') {
      // Process each entry
      for (const entry of body.entry) {
        const webhookEvent = entry.messaging[0];
        const senderId = webhookEvent.sender.id;
        const messageText = webhookEvent.message?.text;

        console.log('Processing message:', { senderId, messageText });

        if (messageText) {
          // Process message in background
          ctx.waitUntil(handleMessage(senderId, messageText.toLowerCase(), env));
        }
      }
      return new Response('EVENT_RECEIVED', { status: 200 });
    }
    
    return new Response('Invalid object', { status: 404 });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response('Error processing webhook', { status: 500 });
  }
}

// Handle different message types
async function handleMessage(senderId, message, env) {
  try {
    if (message.startsWith('help')) {
      await sendHelpMessage(senderId, env);
    } else if (message.startsWith('sms')) {
      await handleSMSCommand(senderId, message, env);
    } else {
      await sendDefaultMessage(senderId, env);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    await sendMessage(senderId, 'Sorry, something went wrong. Please try again.', env);
  }
}

// Handle SMS command
async function handleSMSCommand(senderId, message, env) {
  const parts = message.split(' ');
  
  if (parts.length < 4) {
    await sendMessage(senderId, 
      '❌ Invalid SMS command format.\n\n' +
      '📱 Correct format:\n' +
      'sms [phone] [sender] [message]\n\n' +
      'Example:\n' +
      'sms 090000000 mark Hello World'
    , env);
    return;
  }

  const phone = parts[1];
  const sender = parts[2];
  const text = parts.slice(3).join(' ');

  // Validate phone number (basic validation)
  if (!phone.match(/^09\d{9}$/)) {
    await sendMessage(senderId, 
      '❌ Invalid phone number format. Please use format: 090000000'
    , env);
    return;
  }

  try {
    await sendMessage(senderId, '📤 Sending SMS...', env);

    // Build SMS API URL with parameters
    const smsUrl = `${SMS_API_URL}?phone=${encodeURIComponent(phone)}&sender=${encodeURIComponent(sender)}&text=${encodeURIComponent(text)}`;
    
    console.log('Calling SMS API:', smsUrl);
    const response = await fetch(smsUrl);
    const data = await response.json();

    console.log('SMS API response:', data);

    if (data.success) {
      await sendMessage(senderId, 
        '✅ SMS sent successfully!\n\n' +
        `📞 To: ${phone}\n` +
        `👤 From: ${sender}\n` +
        `💬 Message: ${text}`
      , env);
    } else {
      await sendMessage(senderId, '❌ Failed to send SMS. Please try again.', env);
    }
  } catch (error) {
    console.error('SMS API error:', error);
    await sendMessage(senderId, '❌ Error sending SMS. Please try again later.', env);
  }
}

// Send help message
async function sendHelpMessage(senderId, env) {
  const helpMessage = 
    '🤖 **SMS Bot Help**\n\n' +
    '📱 **Available Commands:**\n' +
    '• `help` - Show this help message\n' +
    '• `sms [phone] [sender] [message]` - Send SMS\n\n' +
    '📝 **SMS Format:**\n' +
    '`sms 09555295917 mark Hello World`\n\n' +
    '📋 **Parameters:**\n' +
    '• `phone` - 11-digit number (09XXXXXXXXX)\n' +
    '• `sender` - Sender name\n' +
    '• `message` - Your text message\n\n' +
    '💡 **Example:**\n' +
    '`sms 09555295917 john Hello there!`';

  await sendMessage(senderId, helpMessage, env);
}

// Send default message
async function sendDefaultMessage(senderId, env) {
  const defaultMessage = 
    '🤖 Welcome to SMS Bot!\n\n' +
    'Type `help` to see available commands.\n' +
    'Type `sms [phone] [sender] [message]` to send an SMS.';

  await sendMessage(senderId, defaultMessage, env);
}

// Send message through Facebook API
async function sendMessage(senderId, message, env) {
  try {
    const PAGE_ACCESS_TOKEN = 'your_page_access_token_here';
    
    const payload = {
      recipient: { id: senderId },
      message: { text: message }
    };

    console.log('Sending message to Facebook API:', payload);

    const response = await fetch(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      }
    );
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error('Facebook API error:', errorData);
      throw new Error(`Facebook API responded with status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('Facebook API response:', result);
    return result;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}