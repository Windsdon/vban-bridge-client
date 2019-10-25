import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const configBase = join(process.cwd(), "config");

const steps = [() => mkdirSync(configBase)];

for (const step of steps) {
	try {
		step();
	} catch (e) {}
}
