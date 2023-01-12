import * as dotenv from 'dotenv'
dotenv.config()

import FSDB from 'file-system-db';
import Discord, { EmbedBuilder, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } from 'discord.js';
import synchronizeSlashCommands from 'discord-sync-commands';
import vinted from 'vinted-api';

const db = new FSDB("./db/db.json", false);
if (!db.has('subscriptions')) db.set('subscriptions', []);

const client = new Discord.Client({ intents: [GatewayIntentBits.Guilds] });

const config = {
    'guildID': '730903935480758292',
    'adminIDs': ['306487572740177920'],
    'preniumIDs': ['1063048640538611742']
}

synchronizeSlashCommands(client, [
    {
        name: 'abonnerbychannel',
        description: 'Abonnez-vous à une URL de recherche en spécifiant le channel de sortie',
        options: [
            {
                name: 'url',
                description: 'L\'URL de la recherche Vinted',
                type: 3,
                required: true
            },
            {
                name: 'channel',
                description: 'Le salon dans lequel vous souhaitez envoyer les notifications',
                type: 7,
                required: true
            }
        ]
    },
    {
        name: 'abonner',
        description: 'Abonnez-vous à une URL de recherche',
        options: [
            {
                name: 'url',
                description: 'L\'URL de la recherche Vinted',
                type: 3,
                required: true
            }
        ]
    },
    {
        name: 'désabonner',
        description: 'Désabonnez-vous d\'une URL de recherche',
        options: [
            {
                name: 'id',
                description: 'L\'identifiant de l\'abonnement (/abonnements)',
                type: 3,
                required: true
            }
        ]
    },
    {
        name: 'abonnements',
        description: 'Accèdez à la liste de tous vos abonnements',
        options: []
    }
], {
    debug: false,
    guildId: config.guildID
}).then((stats) => {
    console.log(`🔁 Commandes mises à jour ! ${stats.newCommandCount} commandes créées, ${stats.currentCommandCount} commandes existantes\n`)
});

let lastFetchFinished = true;

const syncSubscription = (sub) => {
    return new Promise(async (resolve) => {
        await vinted.search(sub.url, false, false, {
            per_page: '20'
        }).then((res) => {
            if (!res.items) {
                console.log('❔ Search done bug got wrong response. Promise resolved.', res);
                resolve();
                return;
            }
            const isFirstSync = db.get('is_first_sync');
            const lastItemTimestamp = db.get(`last_item_ts_${sub.id}`);
            const items = res.items
                .sort((a, b) => new Date(b.photo.high_resolution.timestamp).getTime() - new Date(a.photo.high_resolution.timestamp).getTime())
                .filter((item) => !lastItemTimestamp || new Date(item.photo.high_resolution.timestamp) > lastItemTimestamp);

            if (!items.length) return void resolve();

            const newLastItemTimestamp = new Date(items[0].photo.high_resolution.timestamp).getTime();
            if (!lastItemTimestamp || newLastItemTimestamp > lastItemTimestamp) {
                db.set(`last_item_ts_${sub.id}`, newLastItemTimestamp);
            }

            const itemsToSend = ((lastItemTimestamp && !isFirstSync) ? items.reverse() : [items[0]]);

            for (let item of itemsToSend) {
                const embed = new EmbedBuilder()
                    .setTitle("`👕` **__"+item.title+"__**")
                    .setURL(item.url)
                    .setDescription("`"+(item.description || 'Pas de description')+"`")
                    .setURL(`https://www.vinted.fr${item.path}`)
                    .setImage(item.photo.url)
                    .setColor('#008000')
                    .setTimestamp(item.createdTimestamp)

                    .addFields({ name: "**`💶` Prix**", value: "`"+(item.price || 'vide')+"`", inline: true })
                    .addFields({ name: "**`📏` Taille**", value: "`"+(item.size_title || 'vide')+"`", inline: true })
                    .addFields({ name: "**`💶` Condition**", value: "`"+(item.status || 'vide')+"`", inline: true })

                    .setFooter({ text: `Article lié à la recherche : ${sub.id}` });
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('Détails')
                            .setURL(item.url)
                            .setEmoji('🔎')
                            .setStyle(ButtonStyle.Link),
                        new ButtonBuilder()
                            .setLabel('Acheter')
                            .setURL(`https://www.vinted.fr/transaction/buy/new?source_screen=item&transaction%5Bitem_id%5D=${item.id}`)
                            .setEmoji('💸')
                            .setStyle(ButtonStyle.Link)
                    )

                client.channels.cache.get(sub.channelID)?.send({ embeds: [embed], components: [row] });
            }

            if (itemsToSend.length > 0) {
                console.log(`👕 ${itemsToSend.length} ${itemsToSend.length > 1 ? 'nouveaux articles trouvés' : 'nouvel article trouvé'} pour la recherche ${sub.id} !\n`)
            }

            resolve();
        }).catch((e) => {
            console.error('❌ Search returned an error. Promise resolved.', e);
            resolve();
        });
    });
};

const sync = () => {
    if (!lastFetchFinished) return;
    lastFetchFinished = false;

    console.log(`🤖 Synchronisation à Vinted...\n`)

    const subscriptions = db.get('subscriptions');
    const promises = subscriptions.map((sub) => syncSubscription(sub))
    Promise.all(promises).then(() => {
        db.set('is_first_sync', false);
        lastFetchFinished = true;
    })
}

client.on('ready', () => {
    console.log(`🔗 Connecté sur le compte de ${client.user.tag} !\n`);

    // const entries = db.all().filter((e) => e.key !== 'subscriptions' && !e.key.startsWith('last_item_ts'));
    // entries.forEach((e) => {
    //     db.delete(e.key);
    // });
    // db.set('is_first_sync', true);

    sync();
    setInterval(sync, 15000);

    // const { version } = require('./package.json');
    // client.user.setActivity(`Vinted BOT | v${version}`);
});

const checkPerm = (perm, interaction) => {
    if (perm == 9 && !config.adminIDs.includes(interaction.user.id)) return true;
    
    var isPerm = false;
    for (let elements of interaction.member._roles.values()) {
        isPerm = config.preniumIDs.includes(elements)
    }
    
    if (perm == 1 && !config.preniumIDs.includes(interaction.user.id)) return true;

    return false
}

client.on(Events.InteractionCreate, async interaction => {

    if (!interaction.isCommand()) return;

    switch (interaction.commandName) {
        case 'abonnerbychannel': {
            if (!checkPerm(9, interaction)) return void interaction.reply(`:x: Vous ne disposez pas des droits pour effectuer cette action !`);

            const sub = {
                id: Math.random().toString(36).substring(7),
                url: interaction.options.getString('url'),
                channelID: interaction.options.getChannel('channel').id,
                uuid: String(interaction.user.id)
            }
            db.push('subscriptions.'+interaction.user.id, sub);
            db.set(`last_item_ts_${sub.id}`, "null");
            interaction.reply(`:white_check_mark: Votre abonnement a été créé avec succès !\n**URL**: <${sub.url}>\n**Salon**: <#${sub.channelID}>`);
            break;
        }
        case 'abonner': {
            if (!checkPerm(1, interaction)) return void interaction.reply(`:x: Vous ne disposez pas des droits pour effectuer cette action !`);

            const sub = {
                id: Math.random().toString(36).substring(7),
                url: interaction.options.getString('url'),
                channelID: interaction.channelId,
                uuid: String(interaction.user.id)
            }
            db.push('subscriptions', sub)
            db.set(`last_item_ts_${sub.id}`, "null")
            interaction.reply(`:white_check_mark: Votre abonnement a été créé avec succès !\n**URL**: <${sub.url}>\n**Salon**: <#${sub.channelID}>`);
            break;
        }
        case 'désabonner': {
            const subID = interaction.options.getString('id');
            const subscriptions = db.get('subscriptions')
            const subscription = subscriptions.find((sub) => sub.id === subID);
            if (!subscription) {
                return void interaction.reply(':x: Aucun abonnement trouvé pour votre recherche...');
            }
            const newSubscriptions = subscriptions.filter((sub) => sub.id !== subID);
            db.set('subscriptions', newSubscriptions);
            interaction.reply(`:white_check_mark: Abonnement supprimé avec succès !\n**URL**: <${subscription.url}>\n**Salon**: <#${subscription.channelID}>`);
            break;
        }
        case 'abonnements': {
            const subscriptions = db.get('subscriptions');
            const chunks = [];
    
            subscriptions.forEach((sub) => {
                const content = `**ID**: ${sub.id}\n**URL**: ${sub.url}\n**Salon**: <#${sub.channelID}>\n`;
                const lastChunk = chunks.shift() || [];
                if ((lastChunk.join('\n').length + content.length) > 1024) {
                    if (lastChunk) chunks.push(lastChunk);
                    chunks.push([ content ]);
                } else {
                    lastChunk.push(content);
                    chunks.push(lastChunk);
                }
            });
    
            interaction.reply(`:white_check_mark: **${subscriptions.length}** abonnements sont actifs !`);
    
            chunks.forEach((chunk) => {
                const embed = new EmbedBuilder()
                .setColor('RED')
                .setAuthor(`Utilisez la commande /désabonner pour supprimer un abonnement !`)
                .setDescription(chunk.join('\n'));
            
                interaction.channel.send({ embeds: [embed] });
            });
        }
    }
});

client.login(process.env.TOKEN_KEY);