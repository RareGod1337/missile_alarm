require('dotenv').config();

const MTProto            = require("@mtproto/core");
const prompt             = require("prompt");
const API                = require("./classes/apis/telegramApi");
const WebSocket          = require('ws');

const api = new API();

const missileAlarmTTS  = '' +
    'Ракетная опасность<speaker audio="alice-sounds-game-ping-1.opus"><speaker audio="alice-sounds-game-ping-1.opus"><speaker audio="alice-sounds-game-ping-1.opus">sil<[1500]>' +
    'Ракетная опасность<speaker audio="alice-sounds-game-ping-1.opus"><speaker audio="alice-sounds-game-ping-1.opus"><speaker audio="alice-sounds-game-ping-1.opus">sil<[1500]>' +
    'Ракетная опасность<speaker audio="alice-sounds-game-ping-1.opus"><speaker audio="alice-sounds-game-ping-1.opus"><speaker audio="alice-sounds-game-ping-1.opus">';

const alarmRetreatTTS  = '' +
    'Отбой ракетной опасности<speaker audio="alice-sounds-game-ping-1.opus"><speaker audio="alice-sounds-game-ping-1.opus"><speaker audio="alice-sounds-game-ping-1.opus">sil<[1500]>' +
    'Отбой ракетной опасности<speaker audio="alice-sounds-game-ping-1.opus"><speaker audio="alice-sounds-game-ping-1.opus"><speaker audio="alice-sounds-game-ping-1.opus">sil<[1500]>' +
    'Отбой ракетной опасности<speaker audio="alice-sounds-game-ping-1.opus"><speaker audio="alice-sounds-game-ping-1.opus"><speaker audio="alice-sounds-game-ping-1.opus">';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectToTelegram() {

    const user = await api.getUser();

    if (!user) {
        const { phone }             = await prompt.get("phone");
        const { phone_code_hash }   = await api.sendCode(phone);
        const { code }              = await prompt.get("code");

        try {
            const signInResult = await api.signIn({
                code,
                phone,
                phone_code_hash,
            });

            if (signInResult._ === "auth.authorizationSignUpRequired") {
                const signUpResult = await api.signUp({
                    phone,
                    phone_code_hash,
                });
            }

            const newUser = await api.getUser();
            return true;

        } catch (error) {

            if (error.error_message !== "SESSION_PASSWORD_NEEDED") {
                console.log(`error:`, error);
                return false;
            }

            // 2FA...
        }
    }
    return true;
}

function createWebSocket() {
    return new Promise((resolve, reject) => {

        const ws = new WebSocket(process.env.SOCKET_SERVER, {
            rejectUnauthorized: false // Отключение проверки сертификата (если используется самоподписанный сертификат)
        });

        ws.on('open', () => {
            console.log('[ DEBUG ] Подключился к сокету');
            resolve(ws);
        });

        ws.on('error', (error) => {
            console.log('WebSocket error:', error);
            reject(error);
        });

        ws.on('close', () => {
            console.log('[ DEBUG ] Disconnected from the WebSocket server');
        });
    });
}

async function handleMessages(ws) {

    let peer = await api.resolvePeer(process.env.CHANNEL); // получаем даннные о канале

    if (!peer.id) {
        console.log('[ DEBUG] Ошибка получения данных о канале');
        return;
    }

    let message = await api.getMessages(peer); // просто получаем ID последнего сообщения
    let currentId = message.id;

    console.log('Последнее сообщение: id: ' + message.id + ', ' + message.message);
    console.log('------');
    console.log('');
    console.log('Жду новые сообщения');

    while (true) {

        // восстановление разорванного сокет соединения
        if (ws.readyState !== WebSocket.OPEN) {
            console.log('[ DEBUG ] Нет соединения с сокетом, восстанавливаю');
            try {
                ws = await createWebSocket();
            } catch (error) {
                console.log('[ DEBUG ] Не получилось, жду 5 сек...');
                await sleep(5000);
                continue;
            }
        }

        let messages = await api.getMessages(peer, currentId);

        if (messages.length === 0) {
            await sleep(process.env.CHECK_INTERVAL)
            continue;
        }

        let missileAlarm   = false;
        let alarmRetreat   = false;

        for (let message of messages) {

            let messageFromChannel = message.message.toLowerCase();

            if (messageFromChannel.includes('опасность') || messageFromChannel.includes('в укрытие')) {
                missileAlarm = true;
                console.log('   !!! missileAlarm');
            }

            if (messageFromChannel.includes('отбой')) {
                alarmRetreat = true;
                console.log('   !!! alarmRetreat');
            }

        }

        currentId = messages[0].id;

        if (missileAlarm || alarmRetreat) {

            let tts;

            tts = missileAlarm ? missileAlarmTTS : tts
            tts = alarmRetreat ? alarmRetreatTTS : tts

            for (let i = 0; i < 3; i++) {

                if (ws.readyState !== WebSocket.OPEN) {
                    console.log('[ DEBUG ]  Разорвано соединение во время отправки, пробую... (попытка ' + i + ')');
                    await sleep(2000);
                    continue;
                }

                ws.send(tts);

                console.log('       - Отправил: ' + tts)

                break;

            }
        }

    }
}

(async () => {

    if (await connectToTelegram() === false) {
        console.log('cant connect to telegram');
        return;
    }

    let ws;

    try {
        ws = await createWebSocket();
    } catch (error) {
        throw new Error('Initial WebSocket connection failed')
    }

    await handleMessages(ws);

})();
