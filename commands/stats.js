import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { logCommandUsage } from '../utils/webhookLogger.js';

const STAT_LABELS = {
  products_sold: 'Products Sold',
  total_customers: 'Total Customers',
  feedbacks_received: 'Feedbacks Received',
  average_rating: 'Average Rating'
};

export default {
  data: new SlashCommandBuilder().setName('stats').setDescription('Get shop stats.'),
  async execute(interaction, api) {
    const stats = await api.get(`shops/${api.shopId}/stats`).catch(console.error);

    await logCommandUsage(interaction, 'stats', {
      result: `Retrieved shop stats - Products Sold: ${stats.products_sold}, Customers: ${stats.total_customers}`
    });

    let embed = new EmbedBuilder().setTitle('Shop Stats').setColor('#6571ff');

    for (const [key, value] of Object.entries(stats)) {
      embed.addFields({
        name: `**${STAT_LABELS[key] || key}**`,
        value: `${Math.round(value * 100) / 100}`,
        inline: false
      });
    }

    embed.setTimestamp();

    return interaction.reply({ embeds: [embed] }).catch(console.error);
  }
};
