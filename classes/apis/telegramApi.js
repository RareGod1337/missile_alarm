const path      = require("path");
const MTProto   = require("@mtproto/core");
const { sleep } = require("@mtproto/core/src/utils/common");

class API {
    constructor({ test } = { test: false }) {
        this.mtproto = new MTProto({
            api_id: process.env.TELEGRAM_API_ID,
            api_hash: process.env.TELEGRAM_API_HASH,
            test,
            storageOptions: {
                path: path.resolve(__dirname, "./data/telegramData.json"),
            },
        });
    }

    async call(method, params, options = {}) {
        try {
            return await this.mtproto.call(method, params, options);
        } catch (error) {
            console.error(error);
            const { error_code, error_message } = error;

            if (error_code === 420) {
                const seconds = Number(error_message.split("FLOOD_WAIT_")[1]);
                const ms = seconds * 1000;

                await sleep(ms);

                return this.call(method, params, options);
            }

            if (error_code === 303) {
                const [type, dcIdAsString] = error_message.split("_MIGRATE_");

                const dcId = Number(dcIdAsString);

                // If auth.sendCode call on incorrect DC need change default DC, because
                // call auth.signIn on incorrect DC return PHONE_CODE_EXPIRED error
                if (type === "PHONE") {
                    await this.mtproto.setDefaultDc(dcId);
                } else {
                    Object.assign(options, { dcId });
                }

                return this.call(method, params, options);
            }

            return Promise.reject(error);
        }
    }

    async getUser() {
        try {
            return await this.call("users.getFullUser", {
                id: {
                    _: "inputUserSelf",
                },
            });
        } catch (error) {
            console.log(error)
            return null;
        }
    }

    sendCode(phone) {
        try {
            return this.call("auth.sendCode", {
                phone_number: phone,
                settings: {
                    _: "codeSettings",
                },
            });
        } catch (error) {
            throw error;
        }
    }

    signIn({ code, phone, phone_code_hash }) {
        return this.call("auth.signIn", {
            phone_code: code,
            phone_number: phone,
            phone_code_hash: phone_code_hash,
        });
    }

    signUp({ phone, phone_code_hash }) {
        return this.call("auth.signUp", {
            phone_number: phone,
            phone_code_hash: phone_code_hash,
            first_name: "MTProto",
            last_name: "Core",
        });
    }

    getPassword() {
        return this.call("account.getPassword");
    }

    checkPassword({ srp_id, A, M1 }) {
        return this.call("auth.checkPassword", {
            password: {
                _: "inputCheckPasswordSRP",
                srp_id,
                A,
                M1,
            },
        });
    }

    async resolvePeer(channel) {

        if (!channel) {
            return;
        }

        const resolvedPeer = await this.call('contacts.resolveUsername', {
            username: channel, // Замените на имя вашего канала
        });

        return resolvedPeer.chats.find(
            (chat) => chat.id === resolvedPeer.peer.channel_id
        );

    }

    async getMessages(peer, lastMessageId) {
        try {
            // Подготавливаем inputPeer для канала
            const inputPeer = {
                _: 'inputPeerChannel',
                channel_id: peer.id,
                access_hash: peer.access_hash,
            };

            // Получаем новые сообщения, начиная с последнего полученного
            const result = await this.call('messages.getHistory', {
                peer: inputPeer,
                offset_date: 0,
            });

            if (!lastMessageId) {
                return result.messages[0];
            }

            return result.messages.filter( (message) => (message.id > lastMessageId));

        } catch (error) {
            console.error("Ошибка при получении новых сообщений:", error);
            return null;
        }
    }

}

module.exports = API;
