import ffmpeg = require('ffmpeg-cli');
import path = require('path');
import fs = require('fs-extra');
import { Command } from 'commander';
import JSON5 = require('json5');
import { AudioProps, ProjectConfig } from './config';
import { readCache, writeCache } from './utils';
import hasha = require('hasha');

const INPUT_TYPES = new Set(['wav', 'aif', 'm4a', 'mp3', 'ogg', 'opus', 'flac']);
const CACHE_FILE = '.aveaudiocache';

// opus -  Opus (Opus Interactive Audio Codec) (decoders: opus libopus ) (encoders: opus libopus )
// mp3 - MP3 (MPEG audio layer 3) (decoders: mp3float mp3 ) (encoders: libmp3lame libshine mp3_mf )
async function main()
{
    const program = new Command();
    program
        .option('-c, --config <path to config file>', 'Path to the project configuration file.', 'ave-config.json5')
        .parse();

    const cwd = process.cwd();
    const configPath = path.resolve(cwd, program.opts().config);
    if (!await fs.pathExists(configPath))
    {
        console.error(`No project file found at ${configPath}`);
        process.exit(1);
        return;
    }

    let config: ProjectConfig;
    try
    {
        config = JSON5.parse(await fs.readFile(configPath, 'utf8'));
    }
    catch (e)
    {
        console.error(`Error when parsing project config file: ${e.message || e}`);
        process.exit(1);
        return;
    }

    const baseSrc = path.resolve(cwd, config.audio.baseSrc);
    const baseDest = path.resolve(cwd, config.audio.baseDest);
    const defaults: AudioProps = config.audio.default || {opusTargetBitrate: '32k', mp3Quality: '9'};

    const cache = await readCache<AudioProps>(CACHE_FILE);

    for (const group of config.audio.folders)
    {
        const srcFolder = path.resolve(baseSrc, group.src);
        if (!await fs.pathExists(srcFolder))
        {
            console.log(`** Source folder does not exist: ${srcFolder} **`);
            continue;
        }
        const destFolder = path.resolve(baseDest, group.dest);

        await fs.ensureDir(destFolder);
        const files = await fs.readdir(srcFolder);

        for (const file of files)
        {
            // skip files we don't consider input (primarily to ignore .DS_Store files and other garbage)
            if (!INPUT_TYPES.has(path.extname(file))) continue;
            const cacheId = path.join(group.src + file);
            const fileSrc = path.resolve(srcFolder, file);
            const hash = await hasha.fromFile(fileSrc, {algorithm: 'md5'});
            let overwrite = false;
            if (!cache.has(cacheId) || hash !== cache.get(cacheId).hash)
            {
                overwrite = true;
            }
            const override = group.overrides?.[file];
            const settings = Object.assign({}, defaults, { opusTargetBitrate: group.opusTargetBitrate, mp3Quality: group.mp3Quality }, override);
            const lastSettings = cache.get(cacheId).settings;
            cache.set(cacheId, hash, settings);

            const targetBase = path.resolve(destFolder, file.slice(0, -4));
            const targetOpus = targetBase + '.opus';
            const targetCaf = targetBase + '.caf';
            const targetMp3 = targetBase + '.mp3';
            let writes: string[] = [];
            let encodes: string[] = [];
            if (overwrite || settings.opusTargetBitrate != lastSettings.opusTargetBitrate || !await fs.pathExists(targetOpus))
            {
                writes.push(`-c:a libopus -b:a ${settings.opusTargetBitrate} "${targetOpus}"`);
                encodes.push('opus');
            }
            if (overwrite || settings.opusTargetBitrate != lastSettings.opusTargetBitrate || !await fs.pathExists(targetCaf))
            {
                writes.push(`-c:a libopus -b:a ${settings.opusTargetBitrate} "${targetCaf}"`);
                encodes.push('caf');
            }
            if (overwrite || settings.mp3Quality != lastSettings.mp3Quality || !await fs.pathExists(targetMp3))
            {
                writes.push(`-c:a libmp3lame -q:a ${settings.mp3Quality} "${targetMp3}"`);
                encodes.push('mp3');
            }

            if (!writes.length)
            {
                console.log(`${file} - skipped, one or more outputs exists`);
                continue;
            }
            try
            {
                const result = await ffmpeg.run(`-y -i "${fileSrc}" ${writes.join(' ')}`);
                console.log(`${file} - encoded to ${encodes.join(',')}`);
                if (result)
                {
                    console.log(result);
                }
            }
            catch (e)
            {
                console.log('Error:\n', e);
            }
        }
    }
    await writeCache(cache, CACHE_FILE);
}

main();