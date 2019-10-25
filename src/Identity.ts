import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import * as forge from "node-forge";
import { promisify } from "util";

const generateKeyPair = promisify(forge.pki.rsa.generateKeyPair) as (
	options: forge.pki.rsa.GenerateKeyPairOptions
) => Promise<forge.pki.rsa.KeyPair>;

export interface ClientCredentials {
	key?: string | Buffer | Array<Buffer | Object>;
	cert?: string | Buffer | Array<string | Buffer>;
	passphrase?: string;
}

// TODO: In the future, we should use ED25519 keys, once node-forge adds support for it :)
export default class Identity {
	static async getClientIdentity(): Promise<ClientCredentials> {
		const keyPath = join(process.cwd(), "config/client.key");
		const certPath = join(process.cwd(), "config/client.crt");
		try {
			return {
				key: readFileSync(keyPath),
				cert: readFileSync(certPath)
			};
		} catch (e) {
			return this.generateIdentity();
		}
	}

	private static async generateIdentity(): Promise<ClientCredentials> {
		const keyPath = join(process.cwd(), "config/client.key");
		const certPath = join(process.cwd(), "config/client.crt");

		const keys = await generateKeyPair({
			bits: 4096
		});

		const cert = forge.pki.createCertificate();
		cert.privateKey = keys.privateKey;
		cert.publicKey = keys.publicKey;

		cert.serialNumber = "01";
		cert.validity.notBefore = new Date();
		cert.validity.notAfter = new Date();
		cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 100);
		const attrs: forge.pki.CertificateField[] = [];
		cert.setSubject(attrs);
		cert.setIssuer(attrs);
		cert.setExtensions([
			{
				name: "keyUsage",
				digitalSignature: true,
				keyEncipherment: true,
				dataEncipherment: true
			},
			{
				name: "extKeyUsage",
				clientAuth: true
			}
		]);

		cert.sign(keys.privateKey, forge.md.sha256.create());
		const privatePem = forge.pki.privateKeyToPem(keys.privateKey);
		const certPem = forge.pki.certificateToPem(cert);

		writeFileSync(keyPath, privatePem);
		writeFileSync(certPath, certPem);

		return {
			key: privatePem,
			cert: certPem
		};
	}
}
