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
    } else if (message.startsWith('big')) {
      await handleBigTextCommand(senderId, message, env);
    } else if (message.startsWith('format')) {
      await sendFormattingHelp(senderId, env);
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

// Handle big text command
async function handleBigTextCommand(senderId, message, env) {
  const parts = message.split(' ');

  if (parts.length < 5) {
    await sendMessage(senderId, 
      '🎯 **Big Text SMS Format:**\n\n' +
      '`big [phone] [sender] [style] [message]`\n\n' +
      '📝 **Styles Available:**\n' +
      '• `bold` - 𝐁𝐨𝐥𝐝 𝐓𝐞𝐱𝐭\n' +
      '• `italic` - 𝑰𝒕𝒂𝒍𝒊𝒄 𝑻𝒆𝒙𝒕\n' +
      '• `script` - 𝓢𝓬𝓻𝓲𝓹𝓽 𝓣𝓮𝔁𝓽\n' +
      '• `mono` - 𝙼𝚘𝚗𝚘𝚜𝚙𝚊𝚌𝚎 𝚃𝚎𝚡𝚝\n' +
      '• `double` - 𝔻𝕠𝕦𝕓𝕝𝕖 𝕊𝕥𝕣𝕦𝕔𝕜 𝕋𝕖𝕩𝕥\n' +
      '• `circle` - ⓒⓘⓡⓒⓛⓔⓓ ⓣⓔⓧⓣ\n' +
      '• `smallcaps` - ꜱᴍᴀʟʟ ᴄᴀᴘꜱ ᴛᴇxᴛ\n\n' +
      '💡 **Example:**\n' +
      '`big 09123456789 mark bold Hello World`'
    , env);
    return;
  }

  const phone = parts[1];
  const sender = parts[2];
  const style = parts[3].toLowerCase();
  const originalText = parts.slice(4).join(' ');

  // Validate phone number
  if (!phone.match(/^09\d{9}$/)) {
    await sendMessage(senderId, 
      '❌ Invalid phone number format. Please use format: 090000000'
    , env);
    return;
  }

  // Convert text to selected style
  const formattedText = convertToBigText(originalText, style);
  
  if (!formattedText) {
    await sendMessage(senderId, 
      '❌ Invalid text style. Use `format` command to see available styles.'
    , env);
    return;
  }

  try {
    await sendMessage(senderId, `🎨 Formatting text as ${style}...`, env);

    // Build SMS API URL with formatted text
    const smsUrl = `${SMS_API_URL}?phone=${encodeURIComponent(phone)}&sender=${encodeURIComponent(sender)}&text=${encodeURIComponent(formattedText)}`;

    console.log('Calling SMS API with formatted text:', smsUrl);
    const response = await fetch(smsUrl);
    const data = await response.json();

    console.log('SMS API response:', data);

    if (data.success) {
      await sendMessage(senderId, 
        `✅ ${style.toUpperCase()} SMS sent successfully!\n\n` +
        `📞 To: ${phone}\n` +
        `👤 From: ${sender}\n` +
        `🎨 Style: ${style}\n` +
        `💬 Original: ${originalText}\n` +
        `✨ Formatted: ${formattedText}`
      , env);
    } else {
      await sendMessage(senderId, '❌ Failed to send formatted SMS. Please try again.', env);
    }
  } catch (error) {
    console.error('SMS API error:', error);
    await sendMessage(senderId, '❌ Error sending formatted SMS. Please try again later.', env);
  }
}

// Convert text to big text styles
function convertToBigText(text, style) {
  const styles = {
    // Bold
    bold: {
      mapping: {
        'a': '𝐚', 'b': '𝐛', 'c': '𝐜', 'd': '𝐝', 'e': '𝐞', 'f': '𝐟', 'g': '𝐠', 'h': '𝐡', 'i': '𝐢', 'j': '𝐣',
        'k': '𝐤', 'l': '𝐥', 'm': '𝐦', 'n': '𝐧', 'o': '𝐨', 'p': '𝐩', 'q': '𝐪', 'r': '𝐫', 's': '𝐬', 't': '𝐭',
        'u': '𝐮', 'v': '𝐯', 'w': '𝐰', 'x': '𝐱', 'y': '𝐲', 'z': '𝐳',
        'A': '𝐀', 'B': '𝐁', 'C': '𝐂', 'D': '𝐃', 'E': '𝐄', 'F': '𝐅', 'G': '𝐆', 'H': '𝐇', 'I': '𝐈', 'J': '𝐉',
        'K': '𝐊', 'L': '𝐋', 'M': '𝐌', 'N': '𝐍', 'O': '𝐎', 'P': '𝐏', 'Q': '𝐐', 'R': '𝐑', 'S': '𝐒', 'T': '𝐓',
        'U': '𝐔', 'V': '𝐕', 'W': '𝐖', 'X': '𝐗', 'Y': '𝐘', 'Z': '𝐙'
      }
    },
    
    // Italic
    italic: {
      mapping: {
        'a': '𝑎', 'b': '𝑏', 'c': '𝑐', 'd': '𝑑', 'e': '𝑒', 'f': '𝑓', 'g': '𝑔', 'h': 'ℎ', 'i': '𝑖', 'j': '𝑗',
        'k': '𝑘', 'l': '𝑙', 'm': '𝑚', 'n': '𝑛', 'o': '𝑜', 'p': '𝑝', 'q': '𝑞', 'r': '𝑟', 's': '𝑠', 't': '𝑡',
        'u': '𝑢', 'v': '𝑣', 'w': '𝑤', 'x': '𝑥', 'y': '𝑦', 'z': '𝑧',
        'A': '𝐴', 'B': '𝐵', 'C': '𝐶', 'D': '𝐷', 'E': '𝐸', 'F': '𝐹', 'G': '𝐺', 'H': '𝐻', 'I': '𝐼', 'J': '𝐽',
        'K': '𝐾', 'L': '𝐿', 'M': '𝑀', 'N': '𝑁', 'O': '𝑂', 'P': '𝑃', 'Q': '𝑄', 'R': '𝑅', 'S': '𝑆', 'T': '𝑇',
        'U': '𝑈', 'V': '𝑉', 'W': '𝑊', 'X': '𝑋', 'Y': '𝑌', 'Z': '𝑍'
      }
    },
    
    // Script
    script: {
      mapping: {
        'a': '𝒶', 'b': '𝒷', 'c': '𝒸', 'd': '𝒹', 'e': '𝑒', 'f': '𝒻', 'g': '𝑔', 'h': '𝒽', 'i': '𝒾', 'j': '𝒿',
        'k': '𝓀', 'l': '𝓁', 'm': '𝓂', 'n': '𝓃', 'o': '𝑜', 'p': '𝓅', 'q': '𝓆', 'r': '𝓇', 's': '𝓈', 't': '𝓉',
        'u': '𝓊', 'v': '𝓋', 'w': '𝓌', 'x': '𝓍', 'y': '𝓎', 'z': '𝓏',
        'A': '𝒜', 'B': '𝐵', 'C': '𝒞', 'D': '𝒟', 'E': '𝐸', 'F': '𝐹', 'G': '𝒢', 'H': '𝐻', 'I': '𝐼', 'J': '𝒥',
        'K': '𝒦', 'L': '𝐿', 'M': '𝑀', 'N': '𝒩', 'O': '𝒪', 'P': '𝒫', 'Q': '𝒬', 'R': '𝑅', 'S': '𝒮', 'T': '𝒯',
        'U': '𝒰', 'V': '𝒱', 'W': '𝒲', 'X': '𝒳', 'Y': '𝒴', 'Z': '𝒵'
      }
    },
    
    // Monospace
    mono: {
      mapping: {
        'a': '𝚊', 'b': '𝚋', 'c': '𝚌', 'd': '𝚍', 'e': '𝚎', 'f': '𝚏', 'g': '𝚐', 'h': '𝚑', 'i': '𝚒', 'j': '𝚓',
        'k': '𝚔', 'l': '𝚕', 'm': '𝚖', 'n': '𝚗', 'o': '𝚘', 'p': '𝚙', 'q': '𝚚', 'r': '𝚛', 's': '𝚜', 't': '𝚝',
        'u': '𝚞', 'v': '𝚟', 'w': '𝚠', 'x': '𝚡', 'y': '𝚢', 'z': '𝚣',
        'A': '𝙰', 'B': '𝙱', 'C': '𝙲', 'D': '𝙳', 'E': '𝙴', 'F': '𝙵', 'G': '𝙶', 'H': '𝙷', 'I': '𝙸', 'J': '𝙹',
        'K': '𝙺', 'L': '𝙻', 'M': '𝙼', 'N': '𝙽', 'O': '𝙾', 'P': '𝙿', 'Q': '𝚀', 'R': '𝚁', 'S': '𝚂', 'T': '𝚃',
        'U': '𝚄', 'V': '𝚅', 'W': '𝚆', 'X': '𝚇', 'Y': '𝚈', 'Z': '𝚉'
      }
    },
    
    // Double Struck
    double: {
      mapping: {
        'a': '𝕒', 'b': '𝕓', 'c': '𝕔', 'd': '𝕕', 'e': '𝕖', 'f': '𝕗', 'g': '𝕘', 'h': '𝕙', 'i': '𝕚', 'j': '𝕛',
        'k': '𝕜', 'l': '𝕝', 'm': '𝕞', 'n': '𝕟', 'o': '𝕠', 'p': '𝕡', 'q': '𝕢', 'r': '𝕣', 's': '𝕤', 't': '𝕥',
        'u': '𝕦', 'v': '𝕧', 'w': '𝕨', 'x': '𝕩', 'y': '𝕪', 'z': '𝕫',
        'A': '𝔸', 'B': '𝔹', 'C': 'ℂ', 'D': '𝔻', 'E': '𝔼', 'F': '𝔽', 'G': '𝔾', 'H': 'ℍ', 'I': '𝕀', 'J': '𝕁',
        'K': '𝕂', 'L': '𝕃', 'M': '𝕄', 'N': 'ℕ', 'O': '𝕆', 'P': 'ℙ', 'Q': 'ℚ', 'R': 'ℝ', 'S': '𝕊', 'T': '𝕋',
        'U': '𝕌', 'V': '𝕍', 'W': '𝕎', 'X': '𝕏', 'Y': '𝕐', 'Z': 'ℤ'
      }
    },
    
    // Circled
    circle: {
      mapping: {
        'a': 'ⓐ', 'b': 'ⓑ', 'c': 'ⓒ', 'd': 'ⓓ', 'e': 'ⓔ', 'f': 'ⓕ', 'g': 'ⓖ', 'h': 'ⓗ', 'i': 'ⓘ', 'j': 'ⓙ',
        'k': 'ⓚ', 'l': 'ⓛ', 'm': 'ⓜ', 'n': 'ⓝ', 'o': 'ⓞ', 'p': 'ⓟ', 'q': 'ⓠ', 'r': 'ⓡ', 's': 'ⓢ', 't': 'ⓣ',
        'u': 'ⓤ', 'v': 'ⓥ', 'w': 'ⓦ', 'x': 'ⓧ', 'y': 'ⓨ', 'z': 'ⓩ',
        'A': 'Ⓐ', 'B': 'Ⓑ', 'C': 'Ⓒ', 'D': 'Ⓓ', 'E': 'Ⓔ', 'F': 'Ⓕ', 'G': 'Ⓖ', 'H': 'Ⓗ', 'I': 'Ⓘ', 'J': 'Ⓙ',
        'K': 'Ⓚ', 'L': 'Ⓛ', 'M': 'Ⓜ', 'N': 'Ⓝ', 'O': 'Ⓞ', 'P': 'Ⓟ', 'Q': 'Ⓠ', 'R': 'Ⓡ', 'S': 'Ⓢ', 'T': 'Ⓣ',
        'U': 'Ⓤ', 'V': 'Ⓥ', 'W': 'Ⓦ', 'X': 'Ⓧ', 'Y': 'Ⓨ', 'Z': 'Ⓩ'
      }
    },
    
    // Small Caps
    smallcaps: {
      mapping: {
        'a': 'ᴀ', 'b': 'ʙ', 'c': 'ᴄ', 'd': 'ᴅ', 'e': 'ᴇ', 'f': 'ғ', 'g': 'ɢ', 'h': 'ʜ', 'i': 'ɪ', 'j': 'ᴊ',
        'k': 'ᴋ', 'l': 'ʟ', 'm': 'ᴍ', 'n': 'ɴ', 'o': 'ᴏ', 'p': 'ᴘ', 'q': 'ǫ', 'r': 'ʀ', 's': 's', 't': 'ᴛ',
        'u': 'ᴜ', 'v': 'ᴠ', 'w': 'ᴡ', 'x': 'x', 'y': 'ʏ', 'z': 'ᴢ',
        'A': 'ᴀ', 'B': 'ʙ', 'C': 'ᴄ', 'D': 'ᴅ', 'E': 'ᴇ', 'F': 'ғ', 'G': 'ɢ', 'H': 'ʜ', 'I': 'ɪ', 'J': 'ᴊ',
        'K': 'ᴋ', 'L': 'ʟ', 'M': 'ᴍ', 'N': 'ɴ', 'O': 'ᴏ', 'P': 'ᴘ', 'Q': 'ǫ', 'R': 'ʀ', 'S': 's', 'T': 'ᴛ',
        'U': 'ᴜ', 'V': 'ᴠ', 'W': 'ᴡ', 'X': 'x', 'Y': 'ʏ', 'Z': 'ᴢ'
      }
    }
  };

  const styleConfig = styles[style];
  if (!styleConfig) return null;

  return text.split('').map(char => {
    return styleConfig.mapping[char] || char;
  }).join('');
}

// Send formatting help
async function sendFormattingHelp(senderId, env) {
  const helpMessage = 
    '🎨 **Text Formatting Guide**\n\n' +
    '📝 **Big Text Command:**\n' +
    '`big [phone] [sender] [style] [message]`\n\n' +
    '✨ **Available Styles:**\n' +
    '• `bold` - 𝐁𝐨𝐥𝐝 𝐓𝐞𝐱𝐭\n' +
    '• `italic` - 𝑰𝒕𝒂𝒍𝒊𝒄 𝑻𝒆𝒙𝒕\n' +
    '• `script` - 𝓢𝓬𝓻𝓲𝓹𝓽 𝓣𝓮𝔁𝓽\n' +
    '• `mono` - 𝙼𝚘𝚗𝚘𝚜𝚙𝚊𝚌𝚎 𝚃𝚎𝚡𝚝\n' +
    '• `double` - 𝔻𝕠𝕦𝕓𝕝𝕖 𝕊𝕥𝕣𝕦𝕔𝕜 𝕋𝕖𝕩𝕥\n' +
    '• `circle` - ⓒⓘⓡⓒⓛⓔⓓ ⓣⓔⓧⓣ\n' +
    '• `smallcaps` - ꜱᴍᴀʟʟ ᴄᴀᴘꜱ ᴛᴇxᴛ\n\n' +
    '💡 **Examples:**\n' +
    '`big 09123456789 mark bold Hello`\n' +
    '`big 09123456789 john script Welcome`\n\n' +
    '📱 **Regular SMS:**\n' +
    '`sms [phone] [sender] [message]`';

  await sendMessage(senderId, helpMessage, env);
}

// Send help message
async function sendHelpMessage(senderId, env) {
  const helpMessage = 
    '🤖 **SMS Bot Help**\n\n' +
    '📱 **Available Commands:**\n' +
    '• `help` - Show this help\n' +
    '• `sms [phone] [sender] [message]` - Send regular SMS\n' +
    '• `big [phone] [sender] [style] [message]` - Send formatted text\n' +
    '• `format` - Show text formatting guide\n\n' +
    '💡 **Quick Examples:**\n' +
    '`sms 09123456789 mark Hello World`\n' +
    '`big 09123456789 john bold Welcome`\n\n' +
    'Type `format` for detailed formatting options!';

  await sendMessage(senderId, helpMessage, env);
}

// Send default message
async function sendDefaultMessage(senderId, env) {
  const defaultMessage = 
    '🤖 Welcome to SMS Bot!\n\n' +
    'Type `help` to see available commands.\n' +
    'Type `sms` to send regular SMS.\n' +
    'Type `big` to send formatted text.\n' +
    'Type `format` for text styling guide.';

  await sendMessage(senderId, defaultMessage, env);
}

// Send message through Facebook API
async function sendMessage(senderId, message, env) {
  try {
    const PAGE_ACCESS_TOKEN = 'EAAIFkeOI638BPzQinjUtCrNG08ZBuLjQLkAZAvE5mdti2tAsxYRmTbKhLyg0hFZC6nx3zlsRnzLNe5gg4GqPJx37oIB0WseYZAlSBjnmccTKMaM054QTGPtZBMRBDpd0LxIZCOVzZCMx6Ys0Uxq5Ieadbr5vLQRG1GbCOmGVGZA1efoNZB8sUanbanBjhWNkxn5OejstT6QZDZD';

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