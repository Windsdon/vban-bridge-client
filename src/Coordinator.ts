import * as tls from "tls";
import Identity, { ClientCredentials } from "./Identity";
import { TLSSocket } from "tls";
import EventEmitter from "events";

export type ChallengeFunction = (secret: Buffer) => Promise<Buffer>;

export default class Coordinator extends EventEmitter {
	private readonly host: string;
	private readonly port: number;
	private challengeCallback: ChallengeFunction | undefined;
	private socket: TLSSocket | undefined;
	private authorized: boolean = false;

	constructor(host: string, port: number) {
		super();
		this.host = host;
		this.port = port;
	}

	async init(onChallenge: ChallengeFunction) {
		this.challengeCallback = onChallenge;
		const credentials = await this.getCredentials();
		const socket = await this.connect(this.host, this.port, credentials);
		this.socket = socket;
		socket.on("data", data => this.handleData(data));
		socket.on("end", () => {
			console.log(`Disconnected from coordinator`);
		});
	}

	private async getCredentials(): Promise<ClientCredentials> {
		return Identity.getClientIdentity();
	}

	private async connect(host: string, port: number, credentials: ClientCredentials): Promise<TLSSocket> {
		return new Promise((resolve, reject) => {
			const socket = tls.connect(
				port,
				host,
				{
					...credentials,
					rejectUnauthorized: false
				},
				() => {
					console.log(`Server certificate fingerprint is ${socket.getPeerCertificate().fingerprint}`);
					resolve(socket);
				}
			);

			socket.once("error", err => {
				reject(err);
			});
		});
	}

	private async handleData(data: Buffer) {
		const packetType = data.readUInt8(0);

		switch (packetType) {
			case 0x01:
				return this.handleChallenge(data.slice(1));
			case 0x03:
				this.authorized = true;
				console.log("Authorized");
				return;
			case 0xff:
				this.emit("vban", data.slice(1));
				return;
			default:
				console.error(`Unknown package type: ${packetType}`);
		}
	}

	private async handleChallenge(buffer: Buffer) {
		const answer = await this.challengeCallback!(buffer);
		const response = Buffer.alloc(answer.length + 1);
		response.writeUInt8(0x02, 0);
		answer.copy(response, 1);
		this.socket!.write(response);
	}

	send(msg: Buffer) {
		if (!this.socket || !this.authorized) {
			return;
		}
		const packet = Buffer.alloc(msg.length + 1);
		packet.writeUInt8(0xff, 0);
		msg.copy(packet, 1);
		this.socket!.write(packet);
	}
}
