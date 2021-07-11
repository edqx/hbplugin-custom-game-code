import {
    Connection,
    EventListener,
    HindenburgPlugin,
    Plugin,
    WorkerBeforeCreateEvent,
    WorkerBeforeJoinEvent,
    GameOptions,
    Language,
    ReliablePacket,
    HostGameMessage,
    DisconnectReason
} from "@skeldjs/hindenburg";
import { Code2Int } from "@skeldjs/util";

const i18n = {
    enter_custom_game_code: {
        [Language.English]: "Use the join game section to enter in a custom game code, or enter CANCEL to stop",
        [Language.PortugueseBrazil]: "Use a seção de participação no jogo para inserir um código de jogo personalizado ou CANCEL para parar",
        [Language.German]: "Verwende die Spiel-Beitritts-Sektion um einen eigenen Code einzustellen, oder gebe CANCEL ein um den Vorgang abzubrechen",
        [Language.Spanish]: "Usa la sección de unirse una partida para entrar en una sala con un código personalizado, o presiona CANCEL para cancelar"
    },
    room_with_code_exists: {
        [Language.English]: "There is already a room with that game code, please try another, or enter CANCEL to stop",
        [Language.PortugueseBrazil]: "Já existe um código com esse nome, por favor tente outro, ou digite CANCEL para parar",
        [Language.German]: "Es gibt bereits einen Raum mit diesem Code, versuche es nochmal mit einem anderen oder gebe CANCEL ein um den Vorgang abzubrechen",
        [Language.Spanish]: "Ya hay una sala con ese código, por favor prueba otro, o presiona CANCEL para cancelar"
    }
} as Record<string, Record<number, string>>;

@HindenburgPlugin({
    id: "hbplugin-customgamecode",
    version: "1.0.0",
    order: "none"
})
export default class extends Plugin {
    pendingRooms: Map<string, [ GameOptions, NodeJS.Timeout ]> = new Map;

    formatClient(client: Connection) {
        return client.rinfo.address + ":"
            + client.username + ":"
            + client.clientVersion!.toString();
    }

    @EventListener("worker.beforecreate")
    onWorkerBeforeCreate(ev: WorkerBeforeCreateEvent) {
        ev.cancel();
        ev.client.joinError(i18n.enter_custom_game_code[ev.client.language] || i18n.enter_custom_game_code[Language.English]);

        const keyName = this.formatClient(ev.client);
        this.pendingRooms.set(keyName, [
            ev.gameOptions,
            setTimeout(() => {
                this.pendingRooms.delete(keyName);
            }, 60000)
        ]);
    }

    @EventListener("worker.beforejoin")
    async onWorkerBeforeJoin(ev: WorkerBeforeJoinEvent) {
        const keyName = this.formatClient(ev.client);
        const pendingRoom = this.pendingRooms.get(keyName);
        if (pendingRoom) {
            if (ev.gameCode === Code2Int("CANCEL")) {
                ev.cancel();
                this.pendingRooms.delete(keyName);
                return ev.client.disconnect(DisconnectReason.None); // instantly disconnect with no message
            }

            if (this.worker.rooms.has(ev.gameCode)) {
                ev.cancel();
                return ev.client.joinError(i18n.room_with_code_exists[ev.client.language] || i18n.room_with_code_exists[Language.English]);
            }

            clearInterval(pendingRoom[1]);
            const room = await this.worker.createRoom(ev.gameCode, pendingRoom[0]);
            this.pendingRooms.delete(keyName);
            
            this.logger.info("%s created room %s",
                ev.client, room)

            ev.setRoom(room);
        }
    }
}