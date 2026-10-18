import { installGeneralUser } from "../src/server/audio/instruments/generaluser";
import { instrumentReadiness } from "../src/server/audio/instruments/fluidsynth";

const signal = AbortSignal.timeout(600000);
const directory = await installGeneralUser(signal);
console.log(`GeneralUser GS 2.0.3 and its license are installed in ${directory}`);
const status = await instrumentReadiness(signal);
console.log(status.message);
if (!status.available) process.exitCode = 1;
