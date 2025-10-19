import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { logCommandUsage } from '../utils/webhookLogger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('coupon-delete')
    .setDescription('Delete a coupon.')
    .addStringOption((option) => option.setName('code').setDescription('Coupon code').setRequired(true)),

  onlyWhitelisted: true,

  async execute(interaction, api) {
    const shopId = api.shopId;
    const code = interaction.options.getString('code');

    // TODO: Add endpoint to get a single coupon by code

    // Get all coupons and find the one with the provided code
    let couponData;
    try {
      const coupons = await api.get(`shops/${shopId}/coupons`);
      couponData = coupons.find((coupon) => coupon.code === code);
    } catch (error) {
      await logCommandUsage(interaction, 'coupon-delete', {
        error: `Failed to load coupons: ${error.message}`
      });
      
      console.error(error);
      return interaction.reply({ content: 'Failed to load coupons.', ephemeral: true });
    }

    // Check if the coupon was found
    if (!couponData) {
      await logCommandUsage(interaction, 'coupon-delete', {
        error: `Coupon not found: ${code}`
      });
      
      return interaction.reply({ content: 'Coupon not found.', ephemeral: true });
    }

    // Send the delete request to the server
    try {
      await api.delete(`shops/${shopId}/coupons/${couponData.id}`);

      await logCommandUsage(interaction, 'coupon-delete', {
        result: `Coupon "${code}" deleted successfully`
      });

      const embed = new EmbedBuilder()
        .setTitle('Coupon Deleted')
        .setDescription(`Coupon \`${code}\` has been successfully deleted.`)
        .setColor('#6571ff');

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      await logCommandUsage(interaction, 'coupon-delete', {
        error: `Failed to delete coupon "${code}": ${error.message}`
      });
      
      console.error(error);
      return interaction.reply({ content: 'There was an error deleting the coupon.', ephemeral: true });
    }
  }
};