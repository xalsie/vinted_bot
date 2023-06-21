import * as dotenv from 'dotenv'
dotenv.config()

import FSDB from 'file-system-db';
import moment from 'moment';
    moment.locale('fr');
import Discord, { EmbedBuilder, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } from 'discord.js';
import synchronizeSlashCommands from 'discord-sync-commands';
import * as vinted from './services/vinted-api.js';

const db = new FSDB("./db/db.json", false);
if (!db.has('subscriptions')) db.set('subscriptions', []);

const client = new Discord.Client({ intents: [GatewayIntentBits.Guilds] });

const config = {
    'guildID': '1063460692327411712',
    'adminIDs': ['306487572740177920', '153527254205464576'],
    'lvl1': ['1063526029760663572'],
    'lvl2': ['1063526107648893009']
}

synchronizeSlashCommands(client, [
    {
        name: 'abonnerbychannel',
        description: '[Admin] Abonnez-vous à une URL de recherche en spécifiant le channel de sortie',
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
                required: false
            },
            {
                name: 'user',
                description: 'Affécter l\'URL à un utilisateur.',
                type: 6,
                required: false
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
    },
    {
        name: 'zqihgfqieoufghreugh',
        description: 'test new command',
        options: []
    },
    {
        name: 'lqjmnisdfjoqzefjuio',
        description: 'test new command',
        options: []
    }
], {
    debug: false,
    guildId: config.guildID
}).then((stats) => {
    console.log(`🔁 Commandes mises à jour !`)
    console.log(`   - ${stats.newCommandCount} commandes créées,\n   - ${stats.updatedCommandCount} commandes mise à jour,\n   - ${stats.currentCommandCount} commandes existantes\n`)
});

let lastFetchFinished = true;

const syncSubscription = (sub) => {
    return new Promise(async (resolve) => {
        await vinted.search(sub.url, false, false, {
            per_page: '30',
            order: 'newest_first',
            time: String(moment().unix())
        }).then(async (res) => {
            if (!res.items) {
                console.log('❔ Search done bug got wrong response. Promise resolved.', res, sub.url);
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

            // https://www.vinted.fr/api/v2/items/2582673999

            for (let item of itemsToSend) {
                await vinted.getDetailItem(item.id).then((detail) => {
                    var itemDetail = detail.item;

                    const embed = new EmbedBuilder()
                        .setTitle("`👕` **__"+item.title+"__**")
                        .setURL(item.url)
                        .setDescription("```"+(itemDetail.description || 'Pas de description')+"```")
                        .setImage(itemDetail.photos[0].url)
                        .setColor('#09b1ba')
                        .setTimestamp(item.createdTimestamp)

                        .addFields({ name: "**`💶` Prix**", value: "```"+(item.price+" €" || 'vide')+"```", inline: true })
                        .addFields({ name: "**`📏` Taille**", value: "```"+(item.size_title || 'vide')+"```", inline: true })
                        .addFields({ name: "**`🏷` Marque**", value: "```"+(itemDetail.brand || 'vide')+"```", inline: true })

                        .addFields({ name: "**`👍/👎` Avis**", value: "```"+(itemDetail.user.positive_feedback_count+"/"+itemDetail.user.negative_feedback_count || 'vide')+"```", inline: true })
                        .addFields({ name: "**`🧹` Condition**", value: "```"+(itemDetail.status || 'vide')+"```", inline: true })
                        .addFields({ name: "**`📍` Emplacement**", value: "```"+(itemDetail.city+", "+itemDetail.country  || 'vide')+"```", inline: true })

                        .addFields({ name: "**`👤` Auteur**", value: "```"+(itemDetail.user_login || 'vide')+"```", inline: true })

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

                        // client.channels.cache.get(sub.channelID)?.send({ embeds: [embed], components: [row] });

                }).catch((e) => {
                    console.error('❌ Not returned detail an error. Promise resolved.', e);
                });
            }

            if (itemsToSend.length > 0) {
                console.log(`👕 ${itemsToSend.length} ${itemsToSend.length > 1 ? 'nouveaux articles trouvés' : 'nouvel article trouvé'} pour la recherche ${sub.id} !`)
            }

            resolve()
        }).catch((e) => {
            console.error('❌ Search returned an error. Promise resolved.', e)
            resolve()
        })
    })
}

const sync = () => {
    if (!lastFetchFinished) return;
    lastFetchFinished = false;

    console.log(`\n🤖 Synchronisation à Vinted...`)

    const subscriptions = db.get('subscriptions');
    const promises = subscriptions.map((sub) => syncSubscription(sub))
    Promise.all(promises).then(() => {
        db.set('is_first_sync', false);
        lastFetchFinished = true;
    })
}

client.on('ready', () => {
    console.log(`🔗 Connecté sur le compte de ${client.user.tag} !\n`);

    vinted.fetchCookie()

    // sync()
    setInterval(sync, 5 * 1000) // 15 Second

    // const entries = db.all().filter((e) => e.key !== 'subscriptions' && !e.key.startsWith('last_item_ts'));
    // entries.forEach((e) => {
    //     db.delete(e.key);
    // });
    // db.set('is_first_sync', true);
});

const checkPerm = (perm, interaction) => {
    /* For Admin */ if (perm == 9 && config.adminIDs.includes(interaction.user.id)) return true

    /* For prenium level 1*/ var isPerm = false;
    /* */ for (let elements of interaction.member._roles.values())
    /* */    isPerm = config.lvl1.includes(elements)

    /* */ if (perm == 1 && isPerm) return true

    /* For prenium level 2 */ isPerm = false;
    /* */ for (let elements of interaction.member._roles.values())
    /* */    isPerm = config.lvl2.includes(elements)

    /* */ if (perm == 2 && isPerm) return true

    return false
}

// /abonnerbychannel url:https://www.vinted.fr/vetements? channel:#legrizlydev user:

client.on(Events.InteractionCreate, async interaction => {

    if (!interaction.isCommand()) return;

    switch (interaction.commandName) {
        case 'abonnerbychannel': {
            if (!checkPerm(9, interaction)) return void interaction.reply(`:x: Vous ne disposez pas des droits pour effectuer cette action !`);

            const sub = {
                id: Math.random().toString(36).substring(7),
                url: interaction.options.getString('url'),
                channelID: interaction.options.getChannel('channel').id ?? String(interaction.channelId),
                uuid: interaction.options.getUser('user').id ?? String(interaction.user.id)
            }
            db.push('subscriptions', sub);
            db.set(`last_item_ts_${sub.id}`, "null");
            interaction.reply(`:white_check_mark: Votre abonnement a été créé avec succès !\n**URL**: <${sub.url}>\n**Salon**: <#${sub.channelID}>\n**Utilisateur**: <#${sub.uuid}>`);
            break;
        }
        case 'abonner': {
            if (!checkPerm(9, interaction)) return void interaction.reply(`:x: Vous ne disposez pas des droits pour effectuer cette action !`);

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
            // const lastUpdate = db.all();
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
            var count = 0;

            subscriptions.forEach((sub) => {
                if (sub.uuid !== String(interaction.user.id)) return;

                const content = `**ID**: ${sub.id}\n**URL**: ${sub.url}\n**Salon**: <#${sub.channelID}>\n`;
                const lastChunk = chunks.shift() || [];
                if ((lastChunk.join('\n').length + content.length) > 1024) {
                    if (lastChunk) chunks.push(lastChunk);
                    chunks.push([ content ]);
                } else {
                    lastChunk.push(content);
                    chunks.push(lastChunk);
                }
                count++;
            });

            interaction.reply(`:white_check_mark: Vous-avez **${count}** abonnements actifs !`);

            chunks.forEach(chunk => {
                const embed = new EmbedBuilder()
                    .setColor('#77DD77')
                    .setAuthor({ name: 'Utilisez la commande /désabonner pour supprimer un abonnement !' }) // 2 jours de blocage pour ca !!
                    .setDescription(chunk.join('\n'));

                interaction.channel.send({ embeds: [embed] });
            })
            break;
        }
        case 'zqihgfqieoufghreugh': {
            if (!checkPerm(9, interaction)) return void interaction.reply(`:x: Vous ne disposez pas des droits pour effectuer cette action !`);

            interaction.reply(`pong!`);
            break;
        }
        case 'lqjmnisdfjoqzefjuio': {
            if (!checkPerm(9, interaction)) return void interaction.reply(`:x: Vous ne disposez pas des droits pour effectuer cette action !`);

            interaction.reply(`pong!`);
            break;
        }
    }
});

client.login(process.env.TOKEN_KEY);