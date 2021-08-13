declare module "ffmpeg-cli"
{
    const ffmpeg: {
        run: (command:string) => Promise<string>;
        runSync: (command:string) => string;
    };
    export = ffmpeg;
}