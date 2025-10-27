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
      // Fetch ALL invoices with pagination
      let allInvoices = [];
      let currentPage = 1;
      let hasMorePages = true;
      const maxPages = 50; // Safety limit to prevent infinite loops

      console.log('Starting to fetch invoices...');

      while (hasMorePages && currentPage <= maxPages) {
        try {
          // Try fetching with page parameter
          const response = await api.get(`shops/${shopId}/invoices?page=${currentPage}`);
          
          let invoicesList;
          
          if (Array.isArray(response)) {
            invoicesList = response;
          } else if (response?.data && Array.isArray(response.data)) {
            invoicesList = response.data;
          } else if (response?.invoices && Array.isArray(response.invoices)) {
            invoicesList = response.invoices;
          } else {
            console.log('Unexpected response format on page', currentPage);
            break;
          }

          if (invoicesList.length === 0) {
            hasMorePages = false;
          } else {
            allInvoices = allInvoices.concat(invoicesList);
            console.log(`Fetched page ${currentPage}: ${invoicesList.length} invoices (Total: ${allInvoices.length})`);
            
            // If we got less than a full page (usually 20), we're probably on the last page
            if (invoicesList.length < 20) {
              hasMorePages = false;
            } else {
              currentPage++;
            }
          }
        } catch (error) {
          console.log(`Error fetching page ${currentPage}:`, error.message);
          hasMorePages = false;
        }
      }

      console.log(`Total invoices fetched across all pages: ${allInvoices.length}`);

      if (allInvoices.length === 0) {
        await logCommandUsage(interaction, 'customer-spending', {
          error: 'No invoices found in shop'
        });

        await interaction.editReply({ content: 'No invoices found in the shop.', ephemeral: true });
        return;
      }

      // Normalize search term (trim and lowercase)
      const normalizedSearch = searchTerm.trim().toLowerCase();
      console.log(`Searching for: "${normalizedSearch}"`);

      // Filter invoices by email or check if custom_fields contains Discord username
      const customerInvoices = allInvoices.filter((invoice) => {
        // Check if email matches (trim and lowercase both sides)
        if (invoice.email) {
          const normalizedEmail = invoice.email.trim().toLowerCase();
          if (normalizedEmail === normalizedSearch) {
            return true;
          }
        }

        // Check if custom fields contain the Discord username
        if (invoice.custom_fields) {
          try {
            // Check each custom field individually
            for (const [key, value] of Object.entries(invoice.custom_fields)) {
              if (value && typeof value === 'string') {
                const normalizedValue = value.trim().toLowerCase();
                if (normalizedValue === normalizedSearch || normalizedValue.includes(normalizedSearch)) {
                  return true;
                }
              }
            }
          } catch (e) {
            console.error('Error parsing custom fields:', e);
          }
        }

        return false;
      });

      console.log(`Found ${customerInvoices.length} invoices for search term: "${searchTerm}"`);

      if (customerInvoices.length === 0) {
        await logCommandUsage(interaction, 'customer-spending', {
          error: `No invoices found for search term: ${searchTerm}`
        });

        // Get unique emails for helpful error message
        const uniqueEmails = [...new Set(allInvoices.map(inv => inv.email).filter(e => e))];
        const sampleEmails = uniqueEmails.slice(0, 5).join(', ');

        await interaction.editReply({
          content: `No customer found with email or Discord username: \`${searchTerm}\`\n\n**Searched ${allInvoices.length} total invoices**\n\nTip: Make sure to use the exact email as it appears in the invoices.\n\nSample emails in system: ${sampleEmails}`,
          ephemeral: true
        });
        return;
      }

      // Calculate totals by currency and overall stats
      const completedInvoices = customerInvoices.filter((inv) => 
        inv.completed_at || inv.status === 'COMPLETED' || inv.status === 'completed'
      );
      const pendingInvoices = customerInvoices.filter((inv) => 
        !inv.completed_at && inv.status !== 'COMPLETED' && inv.status !== 'completed'
      );

      // Group by currency
      const totalsByCurrency = {};
      completedInvoices.forEach((invoice) => {
        const currency = invoice.currency || 'USD';
        if (!totalsByCurrency[currency]) {
          totalsByCurrency[currency] = 0;
        }
        totalsByCurrency[currency] += parseFloat(invoice.price) || 0;
      });

      // Get customer email (use the first invoice's email)
      const customerEmail = customerInvoices[0].email || 'N/A';

      // Build currency breakdown string
      let currencyBreakdown = '';
      if (Object.keys(totalsByCurrency).length > 0) {
        for (const [currency, total] of Object.entries(totalsByCurrency)) {
          currencyBreakdown += `${formatPrice(total, currency)}\n`;
        }
      } else {
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
          { name: 'Customer Email', value: customerEmail },
          { name: 'Total Orders', value: customerInvoices.length.toString(), inline: true },
          { name: 'Completed Orders', value: completedInvoices.length.toString(), inline: true },
          { name: 'Pending Orders', value: pendingInvoices.length.toString(), inline: true },
          { name: 'Total Spent', value: currencyBreakdown.trim() || 'No purchases' }
        ]);

      // Add recent purchases (last 5 completed)
      const recentPurchases = completedInvoices
        .sort((a, b) => {
          const dateA = new Date(a.completed_at || a.created_at);
          const dateB = new Date(b.completed_at || b.created_at);
          return dateB - dateA;
        })
        .slice(0, 5);

      if (recentPurchases.length > 0) {
        const recentPurchasesStr = recentPurchases
          .map((inv) => {
            const date = new Date(inv.completed_at || inv.created_at);
            const product = inv.product?.name || 'Unknown Product';
            const price = formatPrice(inv.price, inv.currency || 'USD');
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
        content: `Failed to retrieve customer spending information.\n\nError: ${error.message}\n\nPlease check the bot console for more details.`,
        ephemeral: true
      });
    }
  }
};
