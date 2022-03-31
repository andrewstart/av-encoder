import path = require('path');
import fs = require('fs-extra');
import hasha = require('hasha');

export async function filterChanged<T>(input: T[], test: (item:T) => Promise<string[]|null>): Promise<{item: T, modes: string[]}[]>
{
    const out: {item: T, modes: string[]}[] = [];

    for (const item of input)
    {
        const result = await test(item);
        if (result && result.length)
        {
            out.push({item, modes: result});
        }
    }

    return out;
}

export class Cache<T>
{
    private hashes: Map<string, { hash: string, settings: T }>;
    private unseen: Set<string>;
    private cachePath: string;

    constructor(cachePath: string)
    {
        this.hashes = new Map();
        this.unseen = new Set();
        this.cachePath = path.resolve(process.cwd(), cachePath);
    }

    public getSettings(fileId: string): T
    {
        if (!this.hashes.has(fileId))
        {
            return null;
        }
        return this.hashes.get(fileId).settings;
    }

    /** Doesn't compare settings changes, just ingests them for saving. Only checks for src file changes. */
    public async isDifferent(filePath: string, rootDir: string, settings: T): Promise<boolean>
    {
        const absPath = path.resolve(rootDir, filePath);
        const hash = await hasha.fromFile(absPath, { algorithm: 'md5' });
        const filename = path.basename(filePath, path.extname(filePath));
        // if not present in cache, return true (add to hashes)
        // if present, remove from unseen, compare hash with hasha, and update hashes if changed
        let changed = true;
        if (this.hashes.has(filename))
        {
            const data = this.hashes.get(filename);
            if (data.hash == hash)
            {
                changed = false;
            }
        }
        if (changed)
        {
            this.hashes.set(filename, {hash, settings});
        }
        this.unseen.delete(filename);
        return changed;
    }

    public async load()
    {
        if (!(await fs.pathExists(this.cachePath)))
        {
            return;
        }
        const file = await fs.readFile(this.cachePath, 'utf8');
        const lines = file.split(/\r?\n/);
        for (let line of lines)
        {
            if (!line) continue;
            let fileId: string;
            if (line[0] == '"')
            {
                fileId = line.substring(1, line.indexOf('"', 1));
                line = line.substring(line.indexOf('"', 1) + 2);
            }
            else
            {
                fileId = line.substring(0, line.indexOf(' ', 1));
                line = line.substring(line.indexOf(' ') + 1);
            }
            const hash = line.substring(0, line.indexOf(' '));
            line = line.substring(line.indexOf(' ') + 1);
            const settings = JSON.parse(line);
            this.hashes.set(fileId, { hash, settings });
            this.unseen.add(fileId);
        }
    }

    public async save()
    {
        let text = '';
        for (const [fileId, data] of this.hashes.entries())
        {
            text += `${fileId.includes(' ') ? `"${fileId}"` : fileId} ${data.hash} ${JSON.stringify(data.settings)}\n`;
        }
        await fs.writeFile(this.cachePath, text);
    }

    public purgeUnseen(): string[]
    {
        const missing = Array.from(this.unseen.values());
        for (const id of missing)
        {
            this.hashes.delete(id);
        }
        this.unseen.clear();

        return missing;
    }
}