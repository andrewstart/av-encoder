import ffmpeg = require('ffmpeg-cli');
import path = require('path');
import fs = require('fs-extra');
import { Command } from 'commander';
import JSON5 = require('json5');
import { VideoProps, ProjectConfig } from './config';
import { readCache, writeCache } from './utils';
import hasha = require('hasha');

const INPUT_TYPES = new Set(['.mov', '.mp4']);
const CACHE_FILE = '.avevidiocache';

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

    const baseSrc = path.resolve(cwd, config.video.baseSrc);
    const baseDest = path.resolve(cwd, config.video.baseDest);
    const defaults: VideoProps = config.video.default || { audioOut: null, quality: 28, width: 1280 };

    const cache = await readCache<VideoProps>(CACHE_FILE);

    for (const group of config.video.folders)
    {
        const srcFolder = path.resolve(baseSrc, group.src);
        const destFolder = path.resolve(baseDest, group.dest);

        await fs.ensureDir(destFolder);
        const files = await fs.readdir(srcFolder);

        for (const file of files)
        {
            // skip files we don't consider input (primarily to ignore .DS_Store files and other garbage)
            if (!INPUT_TYPES.has(path.extname(file))) continue;

            const cacheId = path.join(group.src, file);
            const fileSrc = path.resolve(srcFolder, file);
            const hash = await hasha.fromFile(fileSrc, { algorithm: 'md5' });
            let overwrite = false;
            if (!cache.has(cacheId) || hash !== cache.get(cacheId).hash)
            {
                overwrite = true;
            }

            const override = group.overrides?.[file];
            const settings = Object.assign({}, defaults, group, override);
            delete settings.audioOut;
            delete settings.src;
            delete settings.dest;
            const lastSettings = cache.get(cacheId)?.settings;
            cache.set(cacheId, hash, settings);

            const target = path.resolve(destFolder, file.slice(0, -4) + '.mp4');
            const audioOut = override?.audioOut || group.audioOut || defaults.audioOut;
            if (overwrite || settings.quality != lastSettings.quality || settings.width != lastSettings.width || !await fs.pathExists(target))
            {
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
            }
            else
            {
                console.log(`${file} - skipped, output exists`);
            }

            if (audioOut)
            {
                const audioDest = path.resolve(baseSrc, audioOut);
                await fs.ensureDir(audioDest);
                const audioTarget = path.resolve(audioOut, file.slice(0, -4) + '.wav');
                if (overwrite || !await fs.pathExists(audioTarget))
                {
                    try
                    {
                        const audioResult = await ffmpeg.run(`-y -i "${path.resolve(srcFolder, file)}" -c:a pcm_f32le "${audioTarget}"`);
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
    }
    await writeCache(cache, CACHE_FILE);
}

main();