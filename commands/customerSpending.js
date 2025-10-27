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
      // Initial status message
      await interaction.editReply({ content: '🔍 Fetching invoices... (Page 1)', ephemeral: true });

      // Fetch ALL invoices with pagination
      let allInvoices = [];
      let currentPage = 1;
      let hasMorePages = true;
      const maxPages = 500;

      console.log('Starting to fetch invoices...');

      while (hasMorePages && currentPage <= maxPages) {
        try {
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
            
            if (currentPage === 1 || currentPage % 5 === 0 || invoicesList.length < 20) {
              await interaction.editReply({ 
                content: `🔍 Fetching invoices... (Page ${currentPage} - ${allInvoices.length} invoices found)`, 
                ephemeral: true 
              }).catch(err => console.log('Failed to update progress:', err.message));
            }
            
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

      if (currentPage > maxPages) {
        console.log(`WARNING: Reached maximum page limit of ${maxPages}. There may be more invoices.`);
      }

      await interaction.editReply({ 
        content: `🔍 Searching ${allInvoices.length} invoices for: \`${searchTerm}\`...`, 
        ephemeral: true 
      });

      console.log(`Total invoices fetched across all pages: ${allInvoices.length}`);

      if (allInvoices.length === 0) {
        await logCommandUsage(interaction, 'customer-spending', {
          error: 'No invoices found in shop'
        });

        await interaction.editReply({ content: 'No invoices found in the shop.', ephemeral: true });
        return;
      }

      const normalizedSearch = searchTerm.trim().toLowerCase();
      console.log(`Searching for: "${normalizedSearch}"`);

      const customerInvoices = allInvoices.filter((invoice) => {
        if (invoice.email) {
          const normalizedEmail = invoice.email.trim().toLowerCase();
          if (normalizedEmail === normalizedSearch) {
            return true;
          }
        }

        if (invoice.custom_fields) {
          try {
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

        const uniqueEmails = [...new Set(allInvoices.map(inv => inv.email).filter(e => e))];
        const sampleEmails = uniqueEmails.slice(0, 5).join(', ');

        const warningText = currentPage > maxPages 
          ? `\n\n⚠️ **Note**: Search stopped at ${maxPages} pages. There may be more invoices.` 
          : '';

        await interaction.editReply({
          content: `❌ No customer found with email or Discord username: \`${searchTerm}\`\n\n**Searched ${allInvoices.length} total invoices across ${currentPage - 1} pages**${warningText}\n\nTip: Make sure to use the exact email as it appears in the invoices.\n\nSample emails in system: ${sampleEmails}`,
          ephemeral: true
        });
        return;
      }

      const completedInvoices = customerInvoices.filter((inv) => 
        inv.completed_at || inv.status === 'COMPLETED' || inv.status === 'completed'
      );
      const pendingInvoices = customerInvoices.filter((inv) => 
        !inv.completed_at && inv.status !== 'COMPLETED' && inv.status !== 'completed'
      );

      const totalsByCurrency = {};
      completedInvoices.forEach((invoice) => {
        const currency = invoice.currency || 'USD';
        if (!totalsByCurrency[currency]) {
          totalsByCurrency[currency] = 0;
        }
        totalsByCurrency[currency] += parseFloat(invoice.price) || 0;
      });

      const customerEmail = customerInvoices[0].email || 'N/A';

      let currencyBreakdown = '';
      if (Object.keys(totalsByCurrency).length > 0) {
        for (const [currency, total] of Object.entries(totalsByCurrency)) {
          currencyBreakdown += `${formatPrice(total, currency)}\n`;
        }
      } else {
        currencyBreakdown = 'No completed purchases';
      }

      const warningText = currentPage > maxPages 
        ? `\n⚠️ Stopped at ${maxPages} pages - there may be more invoices` 
        : '';

      const embed = new EmbedBuilder()
        .setTitle('Customer Spending Report')
        .setDescription(`Searched ${allInvoices.length} invoices across ${currentPage - 1} pages${warningText}`)
        .setColor('#6571ff')
        .setTimestamp()
        .addFields([
          { name: 'Customer Email', value: customerEmail },
          { name: 'Total Orders', value: customerInvoices.length.toString(), inline: true },
          { name: 'Completed Orders', value: completedInvoices.length.toString(), inline: true },
          { name: 'Pending Orders', value: pendingInvoices.length.toString(), inline: true },
          { name: 'Total Spent', value: currencyBreakdown.trim() || 'No purchases' }
        ]);

      // Get recent purchases and try to fetch details
      const recentInvoices = completedInvoices
        .sort((a, b) => {
          const dateA = new Date(a.completed_at || a.created_at);
          const dateB = new Date(b.completed_at || b.created_at);
          return dateB - dateA;
        })
        .slice(0, 5);

      await interaction.editReply({ 
        content: `🔍 Loading product details...`, 
        ephemeral: true 
      }).catch(() => {});

      if (recentInvoices.length > 0) {
        const recentPurchasesStr = [];
        
        // Debug: Log the structure of the first invoice
        if (recentInvoices[0]) {
          console.log('First invoice structure:', JSON.stringify({
            id: recentInvoices[0].id,
            unique_id: recentInvoices[0].unique_id,
            invoice_id: recentInvoices[0].invoice_id,
            product: recentInvoices[0].product,
            product_id: recentInvoices[0].product_id,
            product_name: recentInvoices[0].product_name
          }));
        }
        
        for (const inv of recentInvoices) {
          try {
            // Try multiple methods to get the invoice ID
            let invoiceId = null;
            
            // Method 1: Check if unique_id exists and extract number
            if (inv.unique_id && typeof inv.unique_id === 'string' && inv.unique_id.includes('-')) {
              invoiceId = inv.unique_id.split('-')[1];
            }
            // Method 2: Use id directly
            else if (inv.id) {
              invoiceId = inv.id;
            }
            // Method 3: Use invoice_id if it exists
            else if (inv.invoice_id) {
              invoiceId = inv.invoice_id;
            }
            
            console.log(`Attempting to fetch invoice with ID: ${invoiceId}`);
            
            if (!invoiceId) {
              throw new Error('No valid invoice ID found');
            }
            
            // Fetch full invoice details
            const fullInvoice = await api.get(`shops/${shopId}/invoices/${invoiceId}`);
            
            const date = new Date(fullInvoice.completed_at || fullInvoice.created_at);
            const product = fullInvoice.product?.name || fullInvoice.product?.title || fullInvoice.product_name || 'Unknown Product';
            const price = formatPrice(fullInvoice.price, fullInvoice.currency || 'USD');
            
            recentPurchasesStr.push(`• ${product} - ${price} (${date.toLocaleDateString()})`);
            console.log(`Successfully fetched product: ${product}`);
          } catch (error) {
            console.error(`Error fetching invoice details for invoice:`, error.message);
            console.error('Invoice object:', JSON.stringify(inv));
            
            // Fallback: Use whatever product info is available in the list
            const date = new Date(inv.completed_at || inv.created_at);
            const product = inv.product?.name || inv.product?.title || inv.product_name || 'Product unavailable';
            const price = formatPrice(inv.price, inv.currency || 'USD');
            recentPurchasesStr.push(`• ${product} - ${price} (${date.toLocaleDateString()})`);
          }
        }

        if (recentPurchasesStr.length > 0) {
          embed.addFields({ name: 'Recent Purchases', value: recentPurchasesStr.join('\n') });
        }

        // Build product list for logging
        const productsSummary = recentPurchasesStr
          .slice(0, 3)
          .map(str => str.split(' - ')[0].replace('• ', ''))
          .join(', ');

        await logCommandUsage(interaction, 'customer-spending', {
          result: `Customer ${customerEmail} - Orders: ${customerInvoices.length}, Completed: ${completedInvoices.length}, Products: ${productsSummary}, Spending: ${currencyBreakdown.replace(/\n/g, ', ')}`
        });
      } else {
        await logCommandUsage(interaction, 'customer-spending', {
          result: `Customer ${customerEmail} - Orders: ${customerInvoices.length}, Completed: ${completedInvoices.length}, Spending: ${currencyBreakdown.replace(/\n/g, ', ')}`
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await logCommandUsage(interaction, 'customer-spending', {
        error: `Failed to get customer spending for "${searchTerm}": ${error.message}`
      });

      console.error('Error fetching customer spending:', error);
      
      await interaction.editReply({
        content: `❌ Failed to retrieve customer spending information.\n\nError: ${error.message}\n\nPlease check the bot console for more details.`,
        ephemeral: true
      });
    }
  }
};
