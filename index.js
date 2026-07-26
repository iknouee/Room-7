require('dotenv').config();

const express = require('express');
const path = require('path');
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  MessageFlags,
  OverwriteType,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');

const requiredEnv = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.error(`Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const PORT = Number(process.env.PORT || 10000);
const BOT_STATUS = process.env.BOT_STATUS || 'welcoming you to Room 7';
const EMBED_COLOR = 0xD99AB5;
const BANNER_PATH = path.join(__dirname, 'assets', 'room7-banner.png');
const BANNER_NAME = 'room7-banner.png';
const DATA_CHANNEL_NAME = 'room7-bot-data';
const DATA_PREFIX = 'ROOM7_CONFIG:';

const defaultConfig = {
  colours: [],
  pings: [],
  panel: { channelId: null, messageId: null },
};

let config = structuredClone(defaultConfig);
let dataChannel = null;
let dataMessage = null;

const commands = [
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure the Room 7 bot.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) => sub
      .setName('add-color')
      .setDescription('Add a role to the color selector.')
      .addRoleOption((option) => option.setName('role').setDescription('The Discord color role.').setRequired(true))
      .addStringOption((option) => option.setName('name').setDescription('Name shown in the menu.').setMaxLength(50))
      .addStringOption((option) => option.setName('emoji').setDescription('Emoji shown beside the color.').setMaxLength(50)))
    .addSubcommand((sub) => sub
      .setName('add-ping')
      .setDescription('Add a role to the ping selector.')
      .addRoleOption((option) => option.setName('role').setDescription('The Discord ping role.').setRequired(true))
      .addStringOption((option) => option.setName('name').setDescription('Name shown in the menu.').setMaxLength(50))
      .addStringOption((option) => option.setName('emoji').setDescription('Emoji shown beside the ping.').setMaxLength(50))
      .addStringOption((option) => option.setName('description').setDescription('Short explanation of this ping.').setMaxLength(100)))
    .addSubcommand((sub) => sub
      .setName('remove-color')
      .setDescription('Remove a role from the color selector.')
      .addRoleOption((option) => option.setName('role').setDescription('The color role to remove.').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('remove-ping')
      .setDescription('Remove a role from the ping selector.')
      .addRoleOption((option) => option.setName('role').setDescription('The ping role to remove.').setRequired(true)))
    .addSubcommand((sub) => sub.setName('list').setDescription('View the current role configuration.'))
    .addSubcommand((sub) => sub
      .setName('clear')
      .setDescription('Clear configured color roles, ping roles, or both.')
      .addStringOption((option) => option
        .setName('section')
        .setDescription('Which section should be cleared?')
        .setRequired(true)
        .addChoices(
          { name: 'Color roles', value: 'colours' },
          { name: 'Ping roles', value: 'pings' },
          { name: 'Everything', value: 'everything' },
        ))),
  new SlashCommandBuilder()
    .setName('setuproles')
    .setDescription('Post or refresh the official Room 7 role panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('roles').setDescription('Open your private Room 7 role selector.'),
  new SlashCommandBuilder().setName('help').setDescription('View the Room 7 bot command guide.'),
  new SlashCommandBuilder().setName('ping').setDescription('Check the bot status and response time.'),
].map((command) => command.toJSON());

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function makeBanner() {
  return new AttachmentBuilder(BANNER_PATH, { name: BANNER_NAME });
}

function baseEmbed() {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setImage(`attachment://${BANNER_NAME}`)
    .setFooter({ text: 'Room 7 • Your place. Our people.' })
    .setTimestamp();
}

function rolePanelEmbed() {
  return baseEmbed()
    .setTitle('Make Room 7 Yours')
    .setDescription([
      'Personalise your Room 7 experience using the buttons below.',
      '',
      '🔔 **Ping Roles**',
      'Choose which announcements, giveaways and events you want to receive.',
      '',
      '🎨 **Color Roles**',
      'Choose one colour to personalise your name throughout the server.',
      '',
      '-# Your selections can be changed at any time.',
    ].join('\n'));
}

function panelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('room7_open_ping_roles').setLabel('Get your Ping Roles').setEmoji('🔔').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('room7_open_colour_roles').setLabel('Get your Color Roles').setEmoji('🎨').setStyle(ButtonStyle.Primary),
  );
}

function colourMenu(member) {
  const options = config.colours.map((item) => {
    const role = member.guild.roles.cache.get(item.id);
    const option = new StringSelectMenuOptionBuilder()
      .setLabel(item.name)
      .setDescription(role ? `Role color: ${role.hexColor}` : 'Color role')
      .setValue(item.id)
      .setDefault(member.roles.cache.has(item.id));
    if (item.emoji) option.setEmoji(item.emoji);
    return option;
  });

  options.push(new StringSelectMenuOptionBuilder()
    .setLabel('Remove Color')
    .setDescription('Remove your current color role')
    .setEmoji('🗑️')
    .setValue('remove_colour'));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('room7_colour_roles')
      .setPlaceholder('Choose your color...')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options),
  );
}

function pingMenu(member) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('room7_ping_roles')
      .setPlaceholder('Choose your ping roles...')
      .setMinValues(0)
      .setMaxValues(config.pings.length)
      .addOptions(config.pings.map((item) => {
        const option = new StringSelectMenuOptionBuilder()
          .setLabel(item.name)
          .setDescription(item.description || 'Receive this notification')
          .setValue(item.id)
          .setDefault(member.roles.cache.has(item.id));
        if (item.emoji) option.setEmoji(item.emoji);
        return option;
      })),
  );
}

async function ensureDataStore(guild) {
  dataChannel = guild.channels.cache.find((channel) => channel.name === DATA_CHANNEL_NAME && channel.type === ChannelType.GuildText);

  if (!dataChannel) {
    dataChannel = await guild.channels.create({
      name: DATA_CHANNEL_NAME,
      type: ChannelType.GuildText,
      reason: 'Persistent Room 7 bot configuration storage',
      permissionOverwrites: [
        { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
        { id: client.user.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ],
    });
  }

  const messages = await dataChannel.messages.fetch({ limit: 50 });
  dataMessage = messages.find((message) => message.author.id === client.user.id && message.content.startsWith(DATA_PREFIX));

  if (dataMessage) {
    try {
      config = { ...structuredClone(defaultConfig), ...JSON.parse(dataMessage.content.slice(DATA_PREFIX.length)) };
      config.colours = Array.isArray(config.colours) ? config.colours : [];
      config.pings = Array.isArray(config.pings) ? config.pings : [];
    } catch (error) {
      console.error('Stored configuration was invalid; using defaults.', error);
      config = structuredClone(defaultConfig);
    }
  } else {
    dataMessage = await dataChannel.send(`${DATA_PREFIX}${JSON.stringify(config)}`);
  }
}

async function saveConfig() {
  if (!dataMessage) throw new Error('The configuration store is unavailable.');
  await dataMessage.edit(`${DATA_PREFIX}${JSON.stringify(config)}`);
}

async function refreshPanel(guild) {
  if (!config.panel?.channelId || !config.panel?.messageId) return;
  const channel = await guild.channels.fetch(config.panel.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const message = await channel.messages.fetch(config.panel.messageId).catch(() => null);
  if (!message) return;
  await message.edit({ embeds: [rolePanelEmbed()], components: [panelButtons()], files: [makeBanner()] }).catch(() => null);
}

function validateAssignableRole(guild, role) {
  if (role.id === guild.roles.everyone.id) throw new Error('The @everyone role cannot be used.');
  if (role.managed) throw new Error('Managed integration or bot roles cannot be assigned through this panel.');
  const botMember = guild.members.me;
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error('Give the bot the **Manage Roles** permission.');
  if (role.position >= botMember.roles.highest.position) throw new Error(`Move the Room 7 bot role above **${role.name}** first.`);
}

async function safeRoleUpdate(member, removeIds, addIds) {
  const botMember = member.guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error('I need the Manage Roles permission.');

  const roles = [...new Set([...removeIds, ...addIds])]
    .map((id) => member.guild.roles.cache.get(id))
    .filter(Boolean);
  const invalid = roles.filter((role) => role.position >= botMember.roles.highest.position || role.managed);
  if (invalid.length) throw new Error(`Move the Room 7 bot role above: ${invalid.map((role) => role.name).join(', ')}`);

  if (removeIds.length) await member.roles.remove(removeIds);
  if (addIds.length) await member.roles.add(addIds);
}

async function handleConfig(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'add-color' || subcommand === 'add-ping') {
    const role = interaction.options.getRole('role', true);
    validateAssignableRole(interaction.guild, role);

    const isColour = subcommand === 'add-color';
    const target = isColour ? config.colours : config.pings;
    const other = isColour ? config.pings : config.colours;
    const limit = isColour ? 24 : 25;

    if (target.some((item) => item.id === role.id)) throw new Error(`**${role.name}** is already configured there.`);
    if (other.some((item) => item.id === role.id)) throw new Error(`**${role.name}** is already being used in the other role menu.`);
    if (target.length >= limit) throw new Error(`Discord allows a maximum of ${limit} roles in this menu.`);

    const name = interaction.options.getString('name')?.trim() || role.name;
    const emoji = interaction.options.getString('emoji')?.trim() || (isColour ? '🎨' : '🔔');
    const item = { id: role.id, name, emoji };
    if (!isColour) item.description = interaction.options.getString('description')?.trim() || `Receive ${name} notifications`;
    target.push(item);

    await saveConfig();
    await refreshPanel(interaction.guild);

    return interaction.reply({
      embeds: [baseEmbed().setTitle(isColour ? 'Color Role Added' : 'Ping Role Added').setDescription(`${emoji} ${role} now appears as **${name}** in the role menu.`)],
      files: [makeBanner()],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (subcommand === 'remove-color' || subcommand === 'remove-ping') {
    const role = interaction.options.getRole('role', true);
    const isColour = subcommand === 'remove-color';
    const key = isColour ? 'colours' : 'pings';
    const before = config[key].length;
    config[key] = config[key].filter((item) => item.id !== role.id);
    if (config[key].length === before) throw new Error(`**${role.name}** is not configured in that menu.`);
    await saveConfig();
    await refreshPanel(interaction.guild);
    return interaction.reply({ content: `✅ Removed **${role.name}** from the ${isColour ? 'color' : 'ping'} menu.`, flags: MessageFlags.Ephemeral });
  }

  if (subcommand === 'clear') {
    const section = interaction.options.getString('section', true);
    if (section === 'everything' || section === 'colours') config.colours = [];
    if (section === 'everything' || section === 'pings') config.pings = [];
    await saveConfig();
    await refreshPanel(interaction.guild);
    return interaction.reply({ content: '✅ The selected configuration has been cleared.', flags: MessageFlags.Ephemeral });
  }

  const colourList = config.colours.length
    ? config.colours.map((item, index) => `${index + 1}. ${item.emoji || '🎨'} <@&${item.id}> — **${item.name}**`).join('\n')
    : '*No color roles configured.*';
  const pingList = config.pings.length
    ? config.pings.map((item, index) => `${index + 1}. ${item.emoji || '🔔'} <@&${item.id}> — **${item.name}**`).join('\n')
    : '*No ping roles configured.*';

  return interaction.reply({
    embeds: [baseEmbed().setTitle('Room 7 Role Configuration').addFields(
      { name: `🎨 Color Roles (${config.colours.length}/24)`, value: colourList },
      { name: `🔔 Ping Roles (${config.pings.length}/25)`, value: pingList },
    )],
    files: [makeBanner()],
    flags: MessageFlags.Ephemeral,
  });
}

async function openPrivateRoleSelector(interaction, type) {
  const isColour = type === 'colour';
  const items = isColour ? config.colours : config.pings;
  if (!items.length) return interaction.reply({ content: `No ${isColour ? 'color' : 'ping'} roles have been configured yet.`, flags: MessageFlags.Ephemeral });

  return interaction.reply({
    embeds: [baseEmbed()
      .setTitle(isColour ? 'Choose Your Color' : 'Choose Your Notifications')
      .setDescription(isColour
        ? 'Select one color below. Choosing another color automatically replaces your current one.'
        : 'Select every notification you want. Remove all selections to stop receiving role pings.')],
    components: [isColour ? colourMenu(interaction.member) : pingMenu(interaction.member)],
    files: [makeBanner()],
    flags: MessageFlags.Ephemeral,
  });
}

async function deployCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log(`Registered ${commands.length} guild command(s).`);
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setPresence({ activities: [{ name: BOT_STATUS }], status: 'online' });

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.roles.fetch();
    await guild.channels.fetch();
    await ensureDataStore(guild);
    await deployCommands();
    console.log(`Loaded ${config.colours.length} color role(s) and ${config.pings.length} ping role(s).`);
  } catch (error) {
    console.error('Startup setup failed:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'config') return handleConfig(interaction);

      if (interaction.commandName === 'setuproles') {
        if (!config.colours.length && !config.pings.length) {
          return interaction.reply({ content: 'Add roles first with `/config add-color` and `/config add-ping`.', flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const message = await interaction.channel.send({ embeds: [rolePanelEmbed()], components: [panelButtons()], files: [makeBanner()] });
        config.panel = { channelId: interaction.channelId, messageId: message.id };
        await saveConfig();
        return interaction.editReply('✅ The official Room 7 role panel has been posted.');
      }

      if (interaction.commandName === 'roles') {
        return interaction.reply({ embeds: [rolePanelEmbed()], components: [panelButtons()], files: [makeBanner()], flags: MessageFlags.Ephemeral });
      }

      if (interaction.commandName === 'help') {
        return interaction.reply({
          embeds: [baseEmbed().setTitle('Room 7 Bot Commands').setDescription('A clean role system built especially for Room 7.').addFields(
            { name: 'Member Commands', value: '`/roles` — Open your private role selector\n`/ping` — Check the bot status' },
            { name: 'Staff Setup', value: '`/config add-color` — Add a color role\n`/config add-ping` — Add a notification role\n`/config remove-color` — Remove a color\n`/config remove-ping` — Remove a ping\n`/config list` — Review the setup\n`/config clear` — Clear a section\n`/setuproles` — Post the public panel' },
          )],
          files: [makeBanner()],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.commandName === 'ping') {
        return interaction.reply({ embeds: [baseEmbed().setTitle('Room 7 is Online').setDescription(`Everything is working normally.\n\n**Response time:** ${client.ws.ping}ms`)], files: [makeBanner()], flags: MessageFlags.Ephemeral });
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'room7_open_ping_roles') return openPrivateRoleSelector(interaction, 'ping');
      if (interaction.customId === 'room7_open_colour_roles') return openPrivateRoleSelector(interaction, 'colour');
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'room7_colour_roles') {
        const selected = interaction.values[0];
        const allIds = config.colours.map((item) => item.id);
        const removeIds = allIds.filter((id) => interaction.member.roles.cache.has(id));
        const addIds = selected === 'remove_colour' ? [] : [selected];
        await safeRoleUpdate(interaction.member, removeIds, addIds);
        const item = config.colours.find((entry) => entry.id === selected);
        return interaction.update({
          embeds: [baseEmbed().setTitle(item ? 'Color Updated' : 'Color Removed').setDescription(item ? `${item.emoji || '🎨'} Your color is now **${item.name}**.` : '🗑️ Your color role has been removed.')],
          components: [colourMenu(interaction.member)],
          files: [makeBanner()],
        });
      }

      if (interaction.customId === 'room7_ping_roles') {
        const allIds = config.pings.map((item) => item.id);
        const selectedIds = interaction.values;
        const currentIds = allIds.filter((id) => interaction.member.roles.cache.has(id));
        await safeRoleUpdate(interaction.member, currentIds.filter((id) => !selectedIds.includes(id)), selectedIds.filter((id) => !interaction.member.roles.cache.has(id)));
        const names = config.pings.filter((item) => selectedIds.includes(item.id)).map((item) => `${item.emoji || '🔔'} ${item.name}`);
        return interaction.update({
          embeds: [baseEmbed().setTitle('Ping Roles Updated').setDescription(names.length ? `You will now receive:\n${names.map((name) => `• **${name}**`).join('\n')}` : '🔕 All of your ping roles have been removed.')],
          components: [pingMenu(interaction.member)],
          files: [makeBanner()],
        });
      }
    }
  } catch (error) {
    console.error('Interaction error:', error);
    const message = `❌ ${error.message || 'Something went wrong.'}`;
    if (interaction.deferred || interaction.replied) await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(() => null);
    else await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => null);
  }
});

client.on('error', (error) => console.error('Discord client error:', error));
process.on('unhandledRejection', (error) => console.error('Unhandled rejection:', error));

const app = express();
app.get('/', (_req, res) => res.status(200).send(`Room 7 bot is ${client.isReady() ? 'online' : 'starting'}.`));
app.listen(PORT, () => console.log(`Health server listening on port ${PORT}.`));

client.login(TOKEN);
