import path = require('path');
import fs = require('fs-extra');

export async function readCache<T>(file: string)
{
    file = path.resolve(process.cwd(), file);
    if (!await fs.pathExists(file))
    {
        return new Cache<T>('');
    }
    const text = await fs.readFile(file, 'utf8');
    return new Cache<T>(text);
}

export async function writeCache(cache: Cache<any>, file: string)
{
    file = path.resolve(process.cwd(), file);

    await fs.writeFile(file, cache.toString());
}

export class Cache<T>
{
    private map: Map<string, {hash:string, settings: T}>;

    constructor(text: string)
    {
        this.map = new Map();
        const lines = text.split(/\r?\n/);
        for (let line of lines)
        {
            if (!line) continue;
            let file: string;
            if (line[0] == '"')
            {
                file = line.substring(1, line.indexOf('"', 1));
                line = line.substring(line.indexOf('"', 1) + 2);
            }
            else
            {
                file = line.substring(0, line.indexOf(' ', 1));
                line = line.substring(line.indexOf(' ') + 1);
            }
            const hash = line.substring(0, line.indexOf(' '));
            line = line.substring(line.indexOf(' ') + 1);
            const settings = JSON.parse(line);
            this.map.set(file, {hash, settings});
        }
    }

    public has(file: string)
    {
        return this.map.has(file);
    }

    public set(file: string, hash:string, settings: T)
    {
        this.map.set(file, {hash, settings});
    }

    public get(file: string)
    {
        return this.map.get(file);
    }

    public toString()
    {
        let text = '';
        for (const [file, data] of this.map.entries())
        {
            text += `${file.includes(' ') ? `"${file}"` : file} ${data.hash} ${JSON.stringify(data.settings)}\n`;
        }
        return text;
    }
}