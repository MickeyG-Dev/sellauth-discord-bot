import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { formatPrice } from '../utils/formatPrice.js';
import { logCommandUsage } from '../utils/webhookLogger.js';

export default {
  data: new SlashCommandBuilder().setName('balances').setDescription('View your cryptocurrency balances.'),

  onlyWhitelisted: true,

  async execute(interaction, api) {
    const shopId = api.shopId;

    try {
      const balances = (await api.get(`shops/${shopId}/payouts/balances`)) || [];

      await logCommandUsage(interaction, 'balances', {
        result: `BTC: ${balances.btc.btc} ₿ ($${balances.btc.usd}), LTC: ${balances.ltc.ltc} Ł ($${balances.ltc.usd})`
      });

      const embed = new EmbedBuilder()
        .setTitle('Balances')
        .setColor('#6571ff')
        .setTimestamp()
        .addFields([
          { name: 'Bitcoin', value: `${balances.btc.btc} ₿ (${formatPrice(balances.btc.usd, 'USD')})` },
          { name: 'Litecoin', value: `${balances.ltc.ltc} Ł (${formatPrice(balances.ltc.usd, 'USD')})` }
        ]);

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      await logCommandUsage(interaction, 'balances', {
        error: `Failed to view balances: ${error.message}`
      });
      
      console.error('Error viewing balances:', error);
      await interaction.reply({ content: 'Failed to view balances.', ephemeral: true });
    }
  }
};
