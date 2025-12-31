// index.js
const { Client, GatewayIntentBits, SlashCommandBuilder, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const fs = require('fs');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// 从 Render 环境变量读取
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID; // 你的 Bot Client ID
const guildId = process.env.GUILD_ID;   // 测试用服务器 ID

// 读取 todos.json
let todos = [];
const TODOS_FILE = './todos.json';
if (fs.existsSync(TODOS_FILE)) {
    todos = JSON.parse(fs.readFileSync(TODOS_FILE, 'utf8'));
}

// 注册 /todo 命令
const commands = [
    new SlashCommandBuilder()
        .setName('todo')
        .setDescription('Manage your todo list')
        .addStringOption(option =>
            option.setName('action')
                  .setDescription('add/list/remove')
                  .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('item')
                  .setDescription('Todo item')
                  .setRequired(false)
        )
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();

client.once('ready', () => {
    console.log(`${client.user.tag} is online`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'todo') {
        const action = interaction.options.getString('action');
        const item = interaction.options.getString('item');

        if (action === 'add') {
            if (!item) return interaction.reply('Please provide an item to add.');
            todos.push(item);
            fs.writeFileSync(TODOS_FILE, JSON.stringify(todos, null, 2));
            return interaction.reply(`Added: ${item}`);
        }

        if (action === 'list') {
            if (todos.length === 0) return interaction.reply('Todo list is empty.');
            return interaction.reply(`Todos:\n- ${todos.join('\n- ')}`);
        }

        if (action === 'remove') {
            if (!item) return interaction.reply('Please provide an item to remove.');
            const index = todos.indexOf(item);
            if (index === -1) return interaction.reply('Item not found.');
            todos.splice(index, 1);
            fs.writeFileSync(TODOS_FILE, JSON.stringify(todos, null, 2));
            return interaction.reply(`Removed: ${item}`);
        }

        return interaction.reply('Unknown action.');
    }
});

client.login(token);
