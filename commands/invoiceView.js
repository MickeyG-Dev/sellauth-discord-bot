import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { formatPrice } from '../utils/formatPrice.js';
import { logCommandUsage } from '../utils/webhookLogger.js';

const formatCoupon = (coupon) => {
  if (!coupon) return 'N/A';

  return `${coupon.code} (${coupon.discount}${coupon.type == 'percentage' ? '%' : coupon.type == 'fixed' ? coupon.currency : ''})`;
};

const formatCustomFields = (customFields) => {
  if (!customFields || Object.entries(customFields).length === 0) return 'N/A';

  return Object.entries(customFields)
    .map(([key, value]) => `${key}: "${value}"`)
    .join(', ');
};

const formatDelivered = (delivered) => {
  if (!delivered) return 'N/A';

  const data = JSON.parse(delivered);

  if (Array.isArray(data)) {
    return data.join(', ');
  }

  return delivered.toString();
};

const formatGatewayInfo = (invoice) => {
  switch (invoice.gateway) {
    case 'CASHAPP':
      return `Transaction ID: "${invoice.cashapp_transaction_id || 'N/A'}"`;
    case 'STRIPE':
      return invoice.stripe_pi_id
        ? `[https://dashboard.stripe.com/payments/${invoice.stripe_pi_id}](https://dashboard.stripe.com/payments/${invoice.stripe_pi_id})`
        : 'N/A';
    case 'PAYPALFF':
      return invoice.paypalff_note ? `Note: "${invoice.paypalff_note}"` : 'N/A';
    case 'SUMUP':
      return invoice.sumup_checkout_id ? `Checkout ID: "${invoice.sumup_checkout_id}"` : 'N/A';
    case 'MOLLIE':
      return invoice.mollie_transaction_id ? `Payment ID: "${invoice.mollie_transaction_id}"` : 'N/A';
    case 'SKRILL':
      return invoice.skrill_transaction_id ? `Transaction ID: "${invoice.skrill_transaction_id}"` : 'N/A';
    default:
      return 'N/A';
  }
};

// Helper function to get product names from items array
const formatProducts = (invoice) => {
  // Check if items array exists and has products
  if (invoice.items && Array.isArray(invoice.items) && invoice.items.length > 0) {
    const products = invoice.items.map(item => item.product?.name || 'Unknown Product');
    return products.join(', ');
  }
  
  // Fallback to legacy product field
  if (invoice.product?.name) {
    return invoice.product.name;
  }
  
  return 'N/A';
};

// Helper function to get variant names from items array
const formatVariants = (invoice) => {
  // Check if items array exists and has variants
  if (invoice.items && Array.isArray(invoice.items) && invoice.items.length > 0) {
    const variants = invoice.items.map(item => item.variant?.name || 'N/A');
    return variants.join(', ');
  }
  
  // Fallback to legacy variant field
  if (invoice.variant?.name) {
    return invoice.variant.name;
  }
  
  return 'N/A';
};

export default {
  data: new SlashCommandBuilder()
    .setName('invoice-view')
    .setDescription('View a invoice.')
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
      let invoice = await api.get(`shops/${shopId}/invoices/${invoiceId}`);

      if (!invoice) {
        await logCommandUsage(interaction, 'invoice-view', {
          error: `Invoice not found: ${id}`
        });
        
        await interaction.reply({ content: `No invoice found with the id: ${id}`, ephemeral: true });
        return;
      }

      const productNames = formatProducts(invoice);
      const variantNames = formatVariants(invoice);

      await logCommandUsage(interaction, 'invoice-view', {
        result: `Viewed invoice ${id} - Status: ${invoice.status}, Product: ${productNames}`
      });

      const embed = new EmbedBuilder()
        .setTitle('Invoice Details')
        .setColor('#6571ff')
        .setTimestamp()
        .addFields([
          { name: 'ID', value: invoice.unique_id },
          { name: 'Status', value: invoice.status.replace(/_/g, ' ') },
          { name: 'Product', value: productNames },
          { name: 'Variant', value: variantNames },
          { name: 'Price', value: formatPrice(invoice.price, invoice.currency) },
          { name: 'Coupon', value: formatCoupon(invoice.coupon) },
          { name: 'Email', value: invoice.email },
          { name: 'Custom Fields', value: formatCustomFields(invoice.custom_fields) },
          { name: 'Gateway', value: invoice.gateway },
          { name: 'Gateway Info', value: formatGatewayInfo(invoice) },
          { name: 'Deliverables', value: formatDelivered(invoice.delivered) },
          { name: 'IP Address', value: invoice.ip },
          { name: 'User Agent', value: invoice.user_agent },
          { name: 'Created At', value: `<t:${Math.floor(new Date(invoice.created_at).getTime() / 1000)}:F>` },
          {
            name: 'Completed At',
            value: invoice.completed_at ? `<t:${Math.floor(new Date(invoice.completed_at).getTime() / 1000)}:F>` : 'N/A'
          }
        ]);

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      await logCommandUsage(interaction, 'invoice-view', {
        error: `Failed to view invoice ${id}: ${error.message}`
      });
      
      console.error('Error viewing invoice:', error);
      await interaction.reply({ content: 'Failed to view invoice.', ephemeral: true });
    }
  }
};
