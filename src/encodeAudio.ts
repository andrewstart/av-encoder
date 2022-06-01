import ffmpeg = require('ffmpeg-cli');
import path = require('path');
import fs = require('fs-extra');
import glob from 'fast-glob';
import { Command } from 'commander';
import JSON5 = require('json5');
import { AudioProps, ProjectConfig } from './config';
import { filterChanged, Cache } from './utils';

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

    const defaults: AudioProps = config.audio.default || {opusTargetBitrate: '32k', mp3Quality: '9', mono: false};
    if (!defaults.formats)
    {
        defaults.formats = ['opus', 'caf', 'mp3'];
    }

    const cache = new Cache<AudioProps>(config.audio.cache || CACHE_FILE);
    await cache.load();

    const destFolders: string[] = [];

    for (const group of config.audio.folders)
    {
        const destFolder = path.resolve(cwd, group.dest);
        await fs.ensureDir(destFolder);
        if (!destFolders.includes(destFolder))
        {
            destFolders.push(destFolder);
        }

        const changed = await filterChanged(
            await glob(group.src, { cwd }),
            async (file) => {
                const id = path.basename(file, path.extname(file));
                const override = group.overrides?.[file];
                const currentSettings = Object.assign({}, defaults, group, override);
                const formats = currentSettings.formats;
                delete currentSettings.src;
                delete currentSettings.dest;
                delete currentSettings.overrides;
                delete currentSettings.formats;
                const oldSettings = cache.getSettings(file) || currentSettings;
                const changed = {opus: false, mp3: false, caf: false, webm: false};
                if (currentSettings.mono != oldSettings.mono)
                {
                    changed.opus = changed.caf = changed.mp3 = changed.webm = true;
                }
                if (currentSettings.opusTargetBitrate != oldSettings.opusTargetBitrate)
                {
                    changed.opus = true;
                    changed.caf = true;
                    changed.webm = true;
                }
                if (currentSettings.mp3Quality != oldSettings.mp3Quality)
                {
                    changed.mp3 = true;
                }

                if (await cache.isDifferent(file, cwd, currentSettings))
                {
                    changed.opus = changed.caf = changed.mp3 = changed.webm = true;
                }
                else
                {
                    const targetBase = path.resolve(destFolder, id);
                    const targetOpus = targetBase + '.opus';
                    const targetCaf = targetBase + '.caf';
                    const targetWebm = targetBase + '.webm';
                    const targetMp3 = targetBase + '.mp3';
                    if (!await fs.pathExists(targetOpus))
                    {
                        changed.opus = true;
                    }
                    if (!await fs.pathExists(targetCaf))
                    {
                        changed.caf = true;
                    }
                    if (!await fs.pathExists(targetWebm))
                    {
                        changed.webm = true;
                    }
                    if (!await fs.pathExists(targetMp3))
                    {
                        changed.mp3 = true;
                    }
                }
                return Object.keys(changed).filter(k => changed[k] && formats.includes(k as keyof typeof changed));
            }
        );

        for (const file of changed)
        {
            const id = path.basename(file.item, path.extname(file.item));
            const fileSrc = file.item;
            const override = group.overrides?.[id];
            const settings = Object.assign({}, defaults, group, override);
            delete settings.src;
            delete settings.dest;
            delete settings.overrides;

            const targetBase = path.resolve(destFolder, id);
            const targetOpus = targetBase + '.opus';
            const targetCaf = targetBase + '.caf';
            const targetWebm = targetBase + '.webm';
            const targetMp3 = targetBase + '.mp3';
            let writes: string[] = [];
            let encodes: string[] = [];
            if (file.modes.includes('opus'))
            {
                writes.push(`-c:a libopus -b:a ${settings.opusTargetBitrate} "${targetOpus}"`);
                encodes.push('opus');
            }
            if (file.modes.includes('caf'))
            {
                writes.push(`-c:a libopus -b:a ${settings.opusTargetBitrate} "${targetCaf}"`);
                encodes.push('caf');
            }
            if (file.modes.includes('webm'))
            {
                writes.push(`-c:a libopus -b:a ${settings.opusTargetBitrate} "${targetWebm}"`);
                encodes.push('webm');
            }
            if (file.modes.includes('mp3'))
            {
                writes.push(`-c:a libmp3lame -q:a ${settings.mp3Quality} "${targetMp3}"`);
                encodes.push('mp3');
            }

            if (!writes.length)
            {
                console.log(`${file.item} - skipped, already up to date`);
                continue;
            }
            try
            {
                const result = await ffmpeg.run(`-y -i "${fileSrc}" ${settings.mono ? '-ac 1' : ''} ${writes.join(' ')}`);
                console.log(`${file.item} - encoded to ${encodes.join(',')}`);
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

    const missing = cache.purgeUnseen();
    await cache.save();

    if (config.audio.removeMissing)
    {
        const exts = ['.mp3', '.opus', '.caf'];
        for (const file of missing)
        {
            const base = path.basename(file, path.extname(file));
            for (const folder of destFolders)
            {
                for (const ext of exts)
                {
                    const filePath = path.resolve(folder, base + ext);
                    if (await fs.pathExists(filePath))
                    {
                        await fs.remove(filePath);
                    }
                }
            }
        }
    }
}

main();