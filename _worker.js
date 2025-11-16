const axios = require("axios");

module.exports = {
  name: "sms",
  description: "Send SMS using external API",
  cooldown: 5, // optional
  run: async ({ api, event, args }) => {
    try {
      // Require phone and message
      if (args.length < 2) {
        return api.sendMessage(
          "❌ Usage:\n.sms <phone> <sender> <message>",
          event.threadID,
          event.messageID
        );
      }

      const phone = args[0];
      const sender = args[1];
      const text = args.slice(2).join(" ");

      if (!text) {
        return api.sendMessage(
          "❌ Please provide a message.\nExample:\n.sms 09555295917 mark Hello",
          event.threadID,
          event.messageID
        );
      }

      // Build API URL
      const url = `https://vercelapi-rouge-three.vercel.app/api/sms?phone=${encodeURIComponent(
        phone
      )}&sender=${encodeURIComponent(sender)}&text=${encodeURIComponent(text)}`;

      // Fetch API
      const res = await axios.get(url);

      // Format response
      if (res.data.success) {
        const reply = `
📨 *SMS Sent Successfully!*

📞 Phone: ${res.data.parameters.phone}
👤 Sender: ${res.data.parameters.sender}
💬 Message: ${res.data.parameters.text}
⏱ Timestamp: ${res.data.timestamp}
`;

        return api.sendMessage(reply, event.threadID, event.messageID);
      } else {
        return api.sendMessage(
          "❌ SMS API returned an error.",
          event.threadID,
          event.messageID
        );
      }
    } catch (err) {
      console.error(err);
      return api.sendMessage(
        "⚠️ Error sending SMS. Check API or parameters.",
        event.threadID,
        event.messageID
      );
    }
  },
};