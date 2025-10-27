import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { formatPrice } from '../utils/formatPrice.js';
import { logCommandUsage } from '../utils/webhookLogger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('customer-spending')
    .setDescription('View total amount spent by a customer.')
    .addStringOption((option) =>
      option
        .setName('search')
        .setDescription('Customer email or Discord username')
        .setRequired(true)
    ),

  onlyWhitelisted: true,

  async execute(interaction, api) {
    const shopId = api.shopId;
    const searchTerm = interaction.options.getString('search');

    await interaction.deferReply();

    try {
      // Fetch all invoices
      const invoices = await api.get(`shops/${shopId}/invoices`);

      if (!invoices || invoices.length === 0) {
        await logCommandUsage(interaction, 'customer-spending', {
          error: 'No invoices found in shop'
        });

        await interaction.editReply({ content: 'No invoices found.', ephemeral: true });
        return;
      }

      // Filter invoices by email or check if custom_fields contains Discord username
      const customerInvoices = invoices.filter((invoice) => {
        // Check if email matches
        if (invoice.email && invoice.email.toLowerCase() === searchTerm.toLowerCase()) {
          return true;
        }

        // Check if custom fields contain the Discord username
        if (invoice.custom_fields) {
          const customFieldsStr = JSON.stringify(invoice.custom_fields).toLowerCase();
          if (customFieldsStr.includes(searchTerm.toLowerCase())) {
            return true;
          }
        }

        return false;
      });

      if (customerInvoices.length === 0) {
        await logCommandUsage(interaction, 'customer-spending', {
          error: `No invoices found for search term: ${searchTerm}`
        });

        await interaction.editReply({
          content: `No customer found with email or Discord username: ${searchTerm}`,
          ephemeral: true
        });
        return;
      }

      // Calculate totals by currency and overall stats
      const completedInvoices = customerInvoices.filter((inv) => inv.completed_at);
      const pendingInvoices = customerInvoices.filter((inv) => !inv.completed_at);

      // Group by currency
      const totalsByCurrency = {};
      completedInvoices.forEach((invoice) => {
        const currency = invoice.currency || 'USD';
        if (!totalsByCurrency[currency]) {
          totalsByCurrency[currency] = 0;
        }
        totalsByCurrency[currency] += invoice.price || 0;
      });

      // Get customer email (use the first invoice's email)
      const customerEmail = customerInvoices[0].email;

      // Build currency breakdown string
      let currencyBreakdown = '';
      for (const [currency, total] of Object.entries(totalsByCurrency)) {
        currencyBreakdown += `${formatPrice(total, currency)}\n`;
      }

      if (!currencyBreakdown) {
        currencyBreakdown = 'No completed purchases';
      }

      await logCommandUsage(interaction, 'customer-spending', {
        result: `Customer ${customerEmail} - Total Orders: ${customerInvoices.length}, Completed: ${completedInvoices.length}, Spending: ${currencyBreakdown.replace(/\n/g, ', ')}`
      });

      const embed = new EmbedBuilder()
        .setTitle('Customer Spending Report')
        .setColor('#6571ff')
        .setTimestamp()
        .addFields([
          { name: 'Customer Email', value: customerEmail || 'N/A' },
          { name: 'Total Orders', value: customerInvoices.length.toString(), inline: true },
          { name: 'Completed Orders', value: completedInvoices.length.toString(), inline: true },
          { name: 'Pending Orders', value: pendingInvoices.length.toString(), inline: true },
          { name: 'Total Spent', value: currencyBreakdown }
        ]);

      // Add recent purchases (last 5 completed)
      const recentPurchases = completedInvoices
        .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
        .slice(0, 5);

      if (recentPurchases.length > 0) {
        const recentPurchasesStr = recentPurchases
          .map((inv) => {
            const date = new Date(inv.completed_at);
            const product = inv.product?.name || 'Unknown Product';
            const price = formatPrice(inv.price, inv.currency);
            return `• ${product} - ${price} (${date.toLocaleDateString()})`;
          })
          .join('\n');

        embed.addFields({ name: 'Recent Purchases', value: recentPurchasesStr });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await logCommandUsage(interaction, 'customer-spending', {
        error: `Failed to get customer spending for "${searchTerm}": ${error.message}`
      });

      console.error('Error fetching customer spending:', error);
      await interaction.editReply({
        content: 'Failed to retrieve customer spending information.',
        ephemeral: true
      });
    }
  }
};
