export interface ProjectConfig
{
    audio: DirectoryListing<AudioProps>;
    /**
     * Configuration for outputting a widely supported .mp4 video file from a source video.
     */
    video?: DirectoryListing<VideoProps>;
}

export interface DirectoryListing<T>
{
    /**
     * Base source path that all src folders are relative to
     */
    baseSrc: string;
    /**
     * Base destination path that all dest folders are relative to
     */
    baseDest: string;
    /**
     * Default settings for this configuration
     */
    default?: T;
    /**
     * List of folders with destinations and any specific settings
     */
    folders: (FolderListing<T> & Partial<T>)[];
}

export interface FolderListing<T>
{
    src: string;
    dest: string;
    /**
     * List of filenames to override settings for.
     */
    overrides?: {[file:string]: T};
}

export interface AudioProps
{
    /**
     * Target bitrate for VBR in the form "(number)k". Lower is lower quality.
     */
    opusTargetBitrate: string;
    /**
     * 0-9, higher is lower quality.
     */
    mp3Quality: string;
}

export interface VideoProps
{
    /**
     * If you want to split a .wav audio file out of the video (muting the video), set this to the folder
     * that you want that audio file to end up in, relative to the baseSrc folder.
     */
    audioOut: string;
    /**
     * MP4 quality: 0 is lossless, 23 is default, and 51 is worst possible. 18-28 is a sane range.
     */
    quality: number;
    /**
     * Width of the video, to handle resizing.
     */
    width: number;
}