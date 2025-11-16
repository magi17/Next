const SMS_API_URL = 'https://vercelapi-rouge-three.vercel.app/api/sms';

// Environment variables (set in Cloudflare dashboard)
const VERIFY_TOKEN = 'mytoken'; // Set in wrangler.toml or dashboard
const PAGE_ACCESS_TOKEN = 'EAAIFkeOI638BP6fmg39U2lFoLNNqJaUUNXiksSNjGpb3tdOBTrF9oa4suM9rCoDb4BliHqRl8SRA1mdroUQHqKlGF3eLvKWiESZAZBFbEO7rPnZBZADndbUnHXWwZBeXMbiUJeciB5DYxoMtIQOkD5s4czA7VS1s1M1GF2eMrqAPVBoKURKsMj5MWKbQMmeuaMb5jBwZDZD'; // Set in wrangler.toml or dashboard

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'GET') {
      return handleWebhookVerification(request);
    } else if (request.method === 'POST') {
      return handleWebhookEvent(request);
    } else {
      return new Response('Method not allowed', { status: 405 });
    }
  },
};

// Handle webhook verification
async function handleWebhookVerification(request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      return new Response(challenge, { status: 200 });
    } else {
      return new Response('Verification failed', { status: 403 });
    }
  }
  
  return new Response('Hello from SMS Bot Worker!', { status: 200 });
}

// Handle incoming webhook events
async function handleWebhookEvent(request) {
  try {
    const body = await request.json();
    
    if (body.object === 'page') {
      // Process each entry
      for (const entry of body.entry) {
        const webhookEvent = entry.messaging[0];
        const senderId = webhookEvent.sender.id;
        const messageText = webhookEvent.message?.text;

        if (messageText) {
          // Process message in background
          ctx.waitUntil(handleMessage(senderId, messageText.toLowerCase()));
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
async function handleMessage(senderId, message) {
  try {
    if (message.startsWith('help')) {
      await sendHelpMessage(senderId);
    } else if (message.startsWith('sms')) {
      await handleSMSCommand(senderId, message);
    } else {
      await sendDefaultMessage(senderId);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    await sendMessage(senderId, 'Sorry, something went wrong. Please try again.');
  }
}

// Handle SMS command
async function handleSMSCommand(senderId, message) {
  const parts = message.split(' ');
  
  if (parts.length < 4) {
    await sendMessage(senderId, 
      '❌ Invalid SMS command format.\n\n' +
      '📱 Correct format:\n' +
      'sms [phone] [sender] [message]\n\n' +
      'Example:\n' +
      'sms 09555295917 mark Hello World'
    );
    return;
  }

  const phone = parts[1];
  const sender = parts[2];
  const text = parts.slice(3).join(' ');

  // Validate phone number (basic validation)
  if (!phone.match(/^09\d{9}$/)) {
    await sendMessage(senderId, 
      '❌ Invalid phone number format. Please use format: 09555295917'
    );
    return;
  }

  try {
    await sendMessage(senderId, '📤 Sending SMS...');

    // Build SMS API URL with parameters
    const smsUrl = `${SMS_API_URL}?phone=${encodeURIComponent(phone)}&sender=${encodeURIComponent(sender)}&text=${encodeURIComponent(text)}`;
    
    const response = await fetch(smsUrl);
    const data = await response.json();

    if (data.success) {
      await sendMessage(senderId, 
        '✅ SMS sent successfully!\n\n' +
        `📞 To: ${phone}\n` +
        `👤 From: ${sender}\n` +
        `💬 Message: ${text}`
      );
    } else {
      await sendMessage(senderId, '❌ Failed to send SMS. Please try again.');
    }
  } catch (error) {
    console.error('SMS API error:', error);
    await sendMessage(senderId, '❌ Error sending SMS. Please try again later.');
  }
}

// Send help message
async function sendHelpMessage(senderId) {
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

  await sendMessage(senderId, helpMessage);
}

// Send default message
async function sendDefaultMessage(senderId) {
  const defaultMessage = 
    '🤖 Welcome to SMS Bot!\n\n' +
    'Type `help` to see available commands.\n' +
    'Type `sms [phone] [sender] [message]` to send an SMS.';

  await sendMessage(senderId, defaultMessage);
}

// Send message through Facebook API
async function sendMessage(senderId, message) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: senderId },
          message: { text: message }
        })
      }
    );
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error('Facebook API error:', errorData);
      throw new Error(`Facebook API responded with status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}