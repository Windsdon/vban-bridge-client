import dgram from "dgram";
import { AddressInfo } from "net";
import Coordinator from "./Coordinator";
import { createHmac } from "crypto";
import * as readline from "readline";

const hubHost = process.env.VBAN_HUB_HOST as string;
const hubPort = parseInt(process.env.VBAN_HUB_PORT as string);
const destinationAddr = process.env.VBAN_DESTINATION_ADDR as string;
const destinationPort = parseInt(process.env.VBAN_DESTINATION_PORT as string);
const listenerAddr = process.env.VBAN_LISTENER_ADDR as string;
const listenerPort = parseInt(process.env.VBAN_LISTENER_PORT as string);

const vbanReceiver = dgram.createSocket("udp4");
const vbanEmitter = dgram.createSocket("udp4");

const coordinator = new Coordinator(hubHost, hubPort);

const STREAM_TIMEOUT = 5000;
const timeouts: Map<string, NodeJS.Timeout> = new Map();

coordinator.on("vban", data => {
	vbanEmitter.send(data, destinationPort, destinationAddr);
});

vbanEmitter.on("error", err => console.error(err));

function bufferToString(buffer: Buffer) {
	const firstNull = buffer.indexOf(0);
	if (firstNull === -1) {
		return buffer.toString("utf8").trim();
	}

	return buffer
		.slice(0, firstNull)
		.toString("utf8")
		.trim();
}

vbanReceiver.on("error", err => {
	console.log(`server error:\n${err.stack}`);
	vbanReceiver.close();
});

vbanReceiver.on("message", (msg, remoteInfo) => {
	const nameBuffer = Buffer.alloc(16);
	msg.copy(nameBuffer, 0, 8);
	const name = bufferToString(nameBuffer);
	const key = `${remoteInfo.address}:${remoteInfo.port}/${name}`;

	coordinator.send(msg);

	const endHandler = () => {
		console.log(`-  Stop: ${key}`);
		timeouts.delete(key);
	};

	if (!timeouts.get(key)) {
		console.log(`+ Start: ${key}`);
	} else {
		clearTimeout(timeouts.get(key)!);
	}

	timeouts.set(key, setTimeout(endHandler, STREAM_TIMEOUT));
});

vbanReceiver.on("listening", () => {
	const address = vbanReceiver.address() as AddressInfo;
	console.log(`receiver listening ${address.address}:${address.port}`);
});

vbanEmitter.on("listening", () => {
	const address = vbanEmitter.address() as AddressInfo;
	console.log(`emitter listening ${address.address}:${address.port}`);
});

vbanReceiver.bind(listenerPort, listenerAddr);

(async () => {
	try {
		console.log(`Connecting to coordinator ${hubHost}:${hubPort}`);
		await coordinator.init(async secret => {
			console.log(`Challenge:`, secret);
			const rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout
			});

			return new Promise<Buffer>(resolve => {
				rl.question("Server password: ", answer => {
					resolve(
						createHmac("sha256", Buffer.from(answer))
							.update(secret)
							.digest()
					);
					rl.close();
				});
			});
		});
	} catch (e) {
		console.error(`Failed to connect`, e);
		setImmediate(() => process.exit(1));
	}
})();
