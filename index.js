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
const TIME_ZONE = 'Europe/London';

const defaultConfig = {
  colours: [],
  pings: [],
  panel: { channelId: null, messageId: null },
  welcome: { channelId: null },
  qotd: { channelId: null, roleId: null, time: '18:00', lastPostedDate: null },
};

const questions = [
  'What is one thing that made you smile today?',
  'What is your dream holiday destination?',
  'Which song have you had on repeat lately?',
  'What is your favourite comfort food?',
  'Would you rather have unlimited money or unlimited free time?',
  'What is one skill you would love to learn?',
  'Which app do you use the most?',
  'What is your favourite memory from this year?',
  'If you could meet any celebrity, who would it be?',
  'What is the best film or series you have watched recently?',
  'Are you more of a morning person or a night owl?',
  'What is one thing on your bucket list?',
  'Which three emojis describe your mood today?',
  'What is your most-used phrase?',
  'If you could instantly travel anywhere right now, where would you go?',
  'What is your favourite thing about weekends?',
  'Which fictional character would you be friends with?',
  'What is the funniest thing that happened to you recently?',
  'What is one food you could eat every day?',
  'What is your current favourite game?',
  'Would you rather live by the beach or in a big city?',
  'What is one unpopular opinion you have?',
  'Which season matches your personality best?',
  'What is the best gift you have ever received?',
  'What is one thing you are looking forward to?',
  'If Room 7 had a theme song, what should it be?',
  'What is your favourite late-night snack?',
  'Which colour best represents you?',
  'What is something everyone should try at least once?',
  'Who in Room 7 would survive longest in a zombie apocalypse?',
];

let config = structuredClone(defaultConfig);
let dataChannel = null;
let dataMessage = null;
let qotdTimer = null;

const commands = [
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure the Room 7 bot.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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
    .addSubcommand((sub) => sub
      .setName('welcome')
      .setDescription('Choose where welcome messages are sent.')
      .addChannelOption((option) => option.setName('channel').setDescription('The welcome channel.').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('qotd')
      .setDescription('Configure the automatic Question of the Day.')
      .addChannelOption((option) => option.setName('channel').setDescription('The QOTD channel.').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addRoleOption((option) => option.setName('role').setDescription('The role to ping each day.').setRequired(true))
      .addStringOption((option) => option.setName('time').setDescription('UK time in 24-hour format, e.g. 18:00.').setRequired(false)))
    .addSubcommand((sub) => sub.setName('list').setDescription('View the current bot configuration.'))
    .addSubcommand((sub) => sub
      .setName('clear')
      .setDescription('Clear configured color roles, ping roles, or both.')
      .addStringOption((option) => option.setName('section').setDescription('Which section should be cleared?').setRequired(true).addChoices(
        { name: 'Color roles', value: 'colours' },
        { name: 'Ping roles', value: 'pings' },
        { name: 'Everything', value: 'everything' },
      ))),
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Post official Room 7 embeds.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName('roles').setDescription('Post or refresh the role panel.'))
    .addSubcommand((sub) => sub.setName('rules').setDescription('Post the official rules embed.'))
    .addSubcommand((sub) => sub.setName('about').setDescription('Post the official About Room 7 embed.')),
  new SlashCommandBuilder()
    .setName('qotd')
    .setDescription('Question of the Day controls.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName('post').setDescription('Post a random question now.')),
  new SlashCommandBuilder().setName('roles').setDescription('Open your private Room 7 role selector.'),
  new SlashCommandBuilder().setName('help').setDescription('View the Room 7 bot command guide.'),
  new SlashCommandBuilder().setName('ping').setDescription('Check the bot status and response time.'),
].map((command) => command.toJSON());

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

function makeBanner() {
  return new AttachmentBuilder(BANNER_PATH, { name: BANNER_NAME });
}

function baseEmbed() {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setImage(`attachment://${BANNER_NAME}`)
    .setFooter({ text: 'Room 7 • Your place. Our people.' });
}

function rolePanelEmbed() {
  return baseEmbed().setTitle('Make Room 7 Yours').setDescription([
    'Personalise your Room 7 experience using the buttons below.',
    '',
    '🔔 **Ping Roles**',
    'Choose the announcements, giveaways and events you want to receive.',
    '',
    '🎨 **Color Roles**',
    'Choose one colour to personalise your name throughout the server.',
    '',
    '-# You can update your selections whenever you like.',
  ].join('\n'));
}

function rulesEmbed() {
  return baseEmbed().setTitle('Room 7 Rules').setDescription('Welcome to **Room 7**. Keep the server friendly, comfortable and enjoyable for everyone.').addFields(
    { name: '01 • Respect Everyone', value: 'No harassment, bullying, discrimination, threats or targeted arguments.' },
    { name: '02 • Keep Drama Private', value: 'Do not bring personal disputes into public channels. Sort problems calmly in DMs or contact staff.' },
    { name: '03 • Keep It Appropriate', value: 'No NSFW content, gore, disturbing media or inappropriate profile content.' },
    { name: '04 • No Spam or Advertising', value: 'Avoid flooding chats, mass mentions, unsolicited DMs and promoting other servers without permission.' },
    { name: '05 • Use Channels Properly', value: 'Post content in the correct place and follow any channel-specific instructions.' },
    { name: '06 • Follow Discord Guidelines', value: 'You must follow Discord’s Terms of Service and Community Guidelines at all times.' },
    { name: 'Staff Decisions', value: 'Staff may act on situations not listed here when needed to protect the community. Use the support channel to appeal calmly.' },
  );
}

function aboutEmbed(guild) {
  return baseEmbed().setTitle('About Room 7').setDescription([
    '**Room 7** is a friendly social hangout built for meeting people, sharing moments and having somewhere comfortable to come back to.',
    '',
    '🛋️ **Hang Out**',
    'Chat, laugh, share photos and join conversations whenever you feel like it.',
    '',
    '📸 **Be Yourself**',
    'Share face reveals, pet reveals, memories, clips and the things you enjoy.',
    '',
    '🎉 **Get Involved**',
    'Take part in daily questions, community events, giveaways and voice chats.',
    '',
    `We currently have **${guild.memberCount.toLocaleString()} members** checked into Room 7.`,
  ].join('\n'));
}

function welcomeEmbed(member) {
  return baseEmbed().setTitle(`Welcome to Room 7, ${member.user.displayName}!`).setDescription([
    `Hey ${member}, you are member **#${member.guild.memberCount.toLocaleString()}**. We’re glad you found us.`,
    '',
    '📜 Read the rules before getting started.',
    '🎨 Choose your colour and notification roles.',
    '💬 Introduce yourself and join the conversation.',
    '',
    '**Your place. Our people. Welcome to Room 7.**',
  ].join('\n')).setThumbnail(member.user.displayAvatarURL({ size: 256 }));
}

function qotdEmbed(question) {
  return baseEmbed().setTitle('Question of the Day').setDescription([
    `## ${question}`,
    '',
    'Share your answer below and reply to other members too.',
    '-# A new question is posted every day.',
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
    const option = new StringSelectMenuOptionBuilder().setLabel(item.name).setDescription(role ? `Role color: ${role.hexColor}` : 'Color role').setValue(item.id).setDefault(member.roles.cache.has(item.id));
    if (item.emoji) option.setEmoji(item.emoji);
    return option;
  });
  options.push(new StringSelectMenuOptionBuilder().setLabel('Remove Color').setDescription('Remove your current color role').setEmoji('🗑️').setValue('remove_colour'));
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('room7_colour_roles').setPlaceholder('Choose your color...').setMinValues(1).setMaxValues(1).addOptions(options));
}

function pingMenu(member) {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('room7_ping_roles').setPlaceholder('Choose your ping roles...').setMinValues(0).setMaxValues(config.pings.length).addOptions(config.pings.map((item) => {
    const option = new StringSelectMenuOptionBuilder().setLabel(item.name).setDescription(item.description || 'Receive this notification').setValue(item.id).setDefault(member.roles.cache.has(item.id));
    if (item.emoji) option.setEmoji(item.emoji);
    return option;
  })));
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
      const stored = JSON.parse(dataMessage.content.slice(DATA_PREFIX.length));
      config = { ...structuredClone(defaultConfig), ...stored };
      config.colours = Array.isArray(config.colours) ? config.colours : [];
      config.pings = Array.isArray(config.pings) ? config.pings : [];
      config.panel = { ...defaultConfig.panel, ...(stored.panel || {}) };
      config.welcome = { ...defaultConfig.welcome, ...(stored.welcome || {}) };
      config.qotd = { ...defaultConfig.qotd, ...(stored.qotd || {}) };
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

function validateTime(value) {
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) throw new Error('Use 24-hour time in `HH:MM` format, for example `18:00`.');
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
  const roles = [...new Set([...removeIds, ...addIds])].map((id) => member.guild.roles.cache.get(id)).filter(Boolean);
  const invalid = roles.filter((role) => role.position >= botMember.roles.highest.position || role.managed);
  if (invalid.length) throw new Error(`Move the Room 7 bot role above: ${invalid.map((role) => role.name).join(', ')}`);
  if (removeIds.length) await member.roles.remove(removeIds);
  if (addIds.length) await member.roles.add(addIds);
}

async function refreshPanel(guild) {
  if (!config.panel?.channelId || !config.panel?.messageId) return;
  const channel = await guild.channels.fetch(config.panel.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const message = await channel.messages.fetch(config.panel.messageId).catch(() => null);
  if (!message) return;
  await message.edit({ embeds: [rolePanelEmbed()], components: [panelButtons()], files: [makeBanner()] }).catch(() => null);
}

async function postQotd(guild, channelOverride = null) {
  const channelId = channelOverride || config.qotd.channelId;
  if (!channelId) throw new Error('Configure QOTD first with `/config qotd`.');
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) throw new Error('The configured QOTD channel could not be found.');
  const question = questions[Math.floor(Math.random() * questions.length)];
  const roleMention = config.qotd.roleId ? `<@&${config.qotd.roleId}>` : '';
  const message = await channel.send({
    content: roleMention,
    embeds: [qotdEmbed(question)],
    files: [makeBanner()],
    allowedMentions: config.qotd.roleId ? { roles: [config.qotd.roleId] } : { parse: [] },
  });
  await message.startThread({ name: `QOTD • ${new Date().toLocaleDateString('en-GB', { timeZone: TIME_ZONE, day: '2-digit', month: 'short' })}`, autoArchiveDuration: 1440 }).catch(() => null);
  return message;
}

function londonParts() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

async function checkQotdSchedule() {
  try {
    if (!client.isReady() || !config.qotd.channelId || !config.qotd.roleId) return;
    const now = londonParts();
    const dateKey = `${now.year}-${now.month}-${now.day}`;
    const timeKey = `${now.hour}:${now.minute}`;
    if (timeKey !== config.qotd.time || config.qotd.lastPostedDate === dateKey) return;
    const guild = await client.guilds.fetch(GUILD_ID);
    await postQotd(guild);
    config.qotd.lastPostedDate = dateKey;
    await saveConfig();
  } catch (error) {
    console.error('QOTD scheduler error:', error);
  }
}

async function handleConfig(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'welcome') {
    const channel = interaction.options.getChannel('channel', true);
    config.welcome.channelId = channel.id;
    await saveConfig();
    return interaction.reply({ embeds: [baseEmbed().setTitle('Welcome Messages Configured').setDescription(`New member welcomes will now be sent in ${channel}.`)], files: [makeBanner()], flags: MessageFlags.Ephemeral });
  }
  if (subcommand === 'qotd') {
    const channel = interaction.options.getChannel('channel', true);
    const role = interaction.options.getRole('role', true);
    const time = interaction.options.getString('time') || '18:00';
    validateTime(time);
    config.qotd = { ...config.qotd, channelId: channel.id, roleId: role.id, time };
    await saveConfig();
    return interaction.reply({ embeds: [baseEmbed().setTitle('Question of the Day Configured').setDescription(`A random question will post in ${channel} every day at **${time} UK time**, pinging ${role}.`)], files: [makeBanner()], flags: MessageFlags.Ephemeral });
  }
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
    return interaction.reply({ embeds: [baseEmbed().setTitle(isColour ? 'Color Role Added' : 'Ping Role Added').setDescription(`${emoji} ${role} now appears as **${name}** in the role menu.`)], files: [makeBanner()], flags: MessageFlags.Ephemeral });
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
  const colourList = config.colours.length ? config.colours.map((item) => `${item.emoji || '🎨'} <@&${item.id}>`).join('\n') : '*Not configured.*';
  const pingList = config.pings.length ? config.pings.map((item) => `${item.emoji || '🔔'} <@&${item.id}>`).join('\n') : '*Not configured.*';
  return interaction.reply({
    embeds: [baseEmbed().setTitle('Room 7 Configuration').addFields(
      { name: `🎨 Color Roles (${config.colours.length})`, value: colourList, inline: true },
      { name: `🔔 Ping Roles (${config.pings.length})`, value: pingList, inline: true },
      { name: '👋 Welcome Channel', value: config.welcome.channelId ? `<#${config.welcome.channelId}>` : '*Not configured.*' },
      { name: '❓ Question of the Day', value: config.qotd.channelId ? `<#${config.qotd.channelId}> • <@&${config.qotd.roleId}> • **${config.qotd.time} UK**` : '*Not configured.*' },
    )],
    files: [makeBanner()],
    flags: MessageFlags.Ephemeral,
  });
}

async function openPrivateRoleSelector(interaction, type) {
  const isColour = type === 'colour';
  const items = isColour ? config.colours : config.pings;
  if (!items.length) return interaction.reply({ content: `No ${isColour ? 'color' : 'ping'} roles have been configured yet.`, flags: MessageFlags.Ephemeral });
  return interaction.reply({ embeds: [baseEmbed().setTitle(isColour ? 'Choose Your Color' : 'Choose Your Notifications').setDescription(isColour ? 'Select one color below. Choosing another automatically replaces your current one.' : 'Select every notification you want. Clear your selections to remove all ping roles.')], components: [isColour ? colourMenu(interaction.member) : pingMenu(interaction.member)], files: [makeBanner()], flags: MessageFlags.Ephemeral });
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
    if (qotdTimer) clearInterval(qotdTimer);
    qotdTimer = setInterval(checkQotdSchedule, 30_000);
    await checkQotdSchedule();
    console.log('Room 7 systems loaded successfully.');
  } catch (error) {
    console.error('Startup setup failed:', error);
  }
});

client.on('guildMemberAdd', async (member) => {
  try {
    if (member.guild.id !== GUILD_ID || !config.welcome.channelId) return;
    const channel = await member.guild.channels.fetch(config.welcome.channelId).catch(() => null);
    if (!channel?.isTextBased()) return;
    await channel.send({ content: `${member}`, embeds: [welcomeEmbed(member)], files: [makeBanner()], allowedMentions: { users: [member.id] } });
  } catch (error) {
    console.error('Welcome message error:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'config') return handleConfig(interaction);
      if (interaction.commandName === 'setup') {
        const sub = interaction.options.getSubcommand();
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (sub === 'roles') {
          if (!config.colours.length && !config.pings.length) return interaction.editReply('Add roles first with `/config add-color` and `/config add-ping`.');
          const message = await interaction.channel.send({ embeds: [rolePanelEmbed()], components: [panelButtons()], files: [makeBanner()] });
          config.panel = { channelId: interaction.channelId, messageId: message.id };
          await saveConfig();
          return interaction.editReply('✅ The official role panel has been posted.');
        }
        if (sub === 'rules') {
          await interaction.channel.send({ embeds: [rulesEmbed()], files: [makeBanner()] });
          return interaction.editReply('✅ The rules embed has been posted.');
        }
        if (sub === 'about') {
          await interaction.channel.send({ embeds: [aboutEmbed(interaction.guild)], files: [makeBanner()] });
          return interaction.editReply('✅ The About Room 7 embed has been posted.');
        }
      }
      if (interaction.commandName === 'qotd') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await postQotd(interaction.guild, interaction.channelId);
        return interaction.editReply('✅ A Question of the Day has been posted here.');
      }
      if (interaction.commandName === 'roles') return interaction.reply({ embeds: [rolePanelEmbed()], components: [panelButtons()], files: [makeBanner()], flags: MessageFlags.Ephemeral });
      if (interaction.commandName === 'help') return interaction.reply({ embeds: [baseEmbed().setTitle('Room 7 Bot Commands').addFields(
        { name: 'Member Commands', value: '`/roles` — Open your role selector\n`/ping` — Check the bot status' },
        { name: 'Staff Setup', value: '`/config add-color` • `/config add-ping`\n`/config welcome` • `/config qotd`\n`/config list` • `/setup roles`\n`/setup rules` • `/setup about`\n`/qotd post` — Post a question now' },
      )], files: [makeBanner()], flags: MessageFlags.Ephemeral });
      if (interaction.commandName === 'ping') return interaction.reply({ embeds: [baseEmbed().setTitle('Room 7 is Online').setDescription(`Everything is working normally.\n\n**Response time:** ${client.ws.ping}ms`)], files: [makeBanner()], flags: MessageFlags.Ephemeral });
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
        return interaction.update({ embeds: [baseEmbed().setTitle(item ? 'Color Updated' : 'Color Removed').setDescription(item ? `${item.emoji || '🎨'} Your color is now **${item.name}**.` : '🗑️ Your color role has been removed.')], components: [colourMenu(interaction.member)], files: [makeBanner()] });
      }
      if (interaction.customId === 'room7_ping_roles') {
        const allIds = config.pings.map((item) => item.id);
        const selectedIds = interaction.values;
        const currentIds = allIds.filter((id) => interaction.member.roles.cache.has(id));
        await safeRoleUpdate(interaction.member, currentIds.filter((id) => !selectedIds.includes(id)), selectedIds.filter((id) => !interaction.member.roles.cache.has(id)));
        const names = config.pings.filter((item) => selectedIds.includes(item.id)).map((item) => `${item.emoji || '🔔'} ${item.name}`);
        return interaction.update({ embeds: [baseEmbed().setTitle('Ping Roles Updated').setDescription(names.length ? `You will now receive:\n${names.map((name) => `• **${name}**`).join('\n')}` : '🔕 All of your ping roles have been removed.')], components: [pingMenu(interaction.member)], files: [makeBanner()] });
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
