import { SlashCommandBuilder } from 'discord.js';
import { logCommandUsage } from '../utils/webhookLogger.js';

export default {
  data: new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!'),
  cooldown: 10,
  async execute(interaction) {
    const ping = Math.round(interaction.client.ws.ping);
    
    await logCommandUsage(interaction, 'ping', {
      result: `Pong! ${ping}ms`
    });
    
    interaction
      .reply({ content: `Pong! ${ping}ms`, ephemeral: true })
      .catch(console.error);
  }
};
