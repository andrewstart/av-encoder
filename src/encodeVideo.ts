import ffmpeg = require('ffmpeg-cli');
import path = require('path');
import fs = require('fs-extra');
import glob from 'fast-glob';
import { Command } from 'commander';
import JSON5 = require('json5');
import { VideoProps, ProjectConfig } from './config';
import { Cache, filterChanged } from './utils';

const CACHE_FILE = '.avevideocache';

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

    if (!config.video)
    {
        console.error(`No video configuration found in config file.`);
        process.exit(1);
        return;
    }

    const defaults: VideoProps = config.video.default || { audioOut: null, quality: 28, width: 1280 };

    const cache = new Cache<VideoProps>(config.video.cache || CACHE_FILE);
    await cache.load();

    const destFolders: string[] = [];

    for (const group of config.video.folders)
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
                delete currentSettings.src;
                delete currentSettings.dest;
                delete currentSettings.overrides;
                delete currentSettings.audioOut;
                const oldSettings = cache.getSettings(file) || currentSettings;
                let changed = false;
                if (currentSettings.quality != oldSettings.quality || currentSettings.width != oldSettings.width)
                {
                    changed = true;
                }

                if (await cache.isDifferent(file, cwd, currentSettings))
                {
                    changed = true;
                }
                else if (!changed)
                {
                    const targetBase = path.resolve(destFolder, id);
                    const target = targetBase + '.mp4';
                    if (!await fs.pathExists(target))
                    {
                        changed = true;
                    }
                }
                return changed ? [''] : null;
            }
        );

        for (const file of changed)
        {
            const id = path.basename(file.item, path.extname(file.item));
            const fileSrc = file.item;
            const override = group.overrides?.[id];
            const settings = Object.assign({}, defaults, group, override);
            const audioOut = settings.audioOut;
            delete settings.src;
            delete settings.dest;
            delete settings.overrides;
            delete settings.audioOut;

            const target = path.resolve(destFolder, id + '.mp4');
            try
            {
                // `-pix_fmt yuv420p` is for Quicktime compatibility (w/h must be divisible by 2)
                // `-profile:v baseline -level 3.0` is for Android compatibility - doesn't support higher profiles
                // `-movflags +faststart` allows play while downloading
                // `scale=1280:-2` scales down the video to 1280 wide, height as a multiple of 2
                const result = await ffmpeg.run(`-y -i "${fileSrc}" -c:v libx264 -pix_fmt yuv420p -profile:v baseline -level 3.0 -crf ${override?.quality ?? group.quality ?? defaults.quality} -preset veryslow -vf scale=${override?.width ?? group.width ?? defaults.width}:-2 ${audioOut ? '-an' : 'c:a aac'} -strict experimental -movflags +faststart -threads 0 "${target}"`);
                console.log(`${file} - encoded to mp4`);
                if (result)
                {
                    console.log(result);
                }
            }
            catch (e)
            {
                console.log('Error:\n', e);
            }

            if (audioOut)
            {
                const audioDest = path.resolve(cwd, audioOut);
                await fs.ensureDir(audioDest);
                const audioTarget = path.resolve(audioDest, id + '.wav');
                try
                {
                    const audioResult = await ffmpeg.run(`-y -i "${fileSrc}" -c:a pcm_f32le "${audioTarget}"`);
                    console.log(`${file} - encoded to wav`);
                    if (audioResult)
                    {
                        console.log(audioResult);
                    }
                }
                catch (e)
                {
                    console.log('Error:\n', e);
                }
            }
        }
    }

    const missing = cache.purgeUnseen();
    await cache.save();

    if (config.audio.removeMissing)
    {
        for (const file of missing)
        {
            const base = path.basename(file, path.extname(file));
            for (const folder of destFolders)
            {
                const filePath = path.resolve(folder, base + '.mp4');
                if (await fs.pathExists(filePath))
                {
                    await fs.remove(filePath);
                }
            }
        }
    }
}

main();