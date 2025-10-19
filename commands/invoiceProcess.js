import { SlashCommandBuilder } from 'discord.js';
import { logCommandUsage } from '../utils/webhookLogger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('invoice-process')
    .setDescription('process a invoice.')
    .addStringOption((option) => option.setName('id').setDescription('The invoice ID to search for').setRequired(true)),

  onlyWhitelisted: true,

  async execute(interaction, api) {
    const shopId = api.shopId;
    const id = interaction.options.getString('id');

    let invoiceId = id;

    if (invoiceId.includes('-')) {
      invoiceId = Number(id.split('-')[1]);
    }

    try {
      await api.get(`shops/${shopId}/invoices/${invoiceId}/process`);
      
      await logCommandUsage(interaction, 'invoice-process', {
        result: `Invoice ${id} processed successfully`
      });
      
      await interaction.reply({ content: 'Invoice processed successfully.', ephemeral: true });
    } catch (error) {
      if (error.response) {
        if (error.response.status === 404) {
          await logCommandUsage(interaction, 'invoice-process', {
            error: `Invoice not found: ${id}`
          });
          
          await interaction.reply({ content: `No invoice found with the id: ${id}`, ephemeral: true });
          return;
        }

        if (error.response.status === 400) {
          await logCommandUsage(interaction, 'invoice-process', {
            error: `Invoice already processed or failed: ${id}`
          });
          
          await interaction.reply({ content: 'Invoice already processed or failed to process.', ephemeral: true });
          return;
        }
      }

      await logCommandUsage(interaction, 'invoice-process', {
        error: `Failed to process invoice ${id}: ${error.message}`
      });

      console.error('Error processing invoice:', error);
      await interaction.reply({ content: 'Failed to process invoice.', ephemeral: true });
    }
  }
};